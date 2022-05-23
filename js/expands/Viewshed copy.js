import FrustumVertex from './FrustumVertex.js';

const toDegree = 180 / Math.PI;
const toRadian = Math.PI / 180;
const PI2 = Math.PI * 2;

/**
 * 视域分析类
 */
const Viewshed = class {

	constructor( viewer, option = {} ) {

		// 需要对 viewer 进行操作，故需要 viewer 环境
		this.viewer = viewer;

		/** 基础参数配置 */
		// 起点，终点，半径
		this.center = option.center;
		this.finish = option.finish;
		this.radius = option.radius;

		this.realyRadius = this.radius ?? Cesium.Cartesian3.distance( this.center, this.finish );

		// 水平、竖直角
		this.hAngle = option.hAngle || 120.0;
		this.vAngle = option.vAngle || 120.0;

		// 视网面网格 水平、竖直 切分个数
		this.hMeshGrid = option.hMeshGrid || 23;
		this.vMeshGrid = option.vMeshGrid || 23;

		// 视网线网格 水平、竖直 切分个数
		this.hLineGrid = option.hLineGrid || 10;
		this.vLineGrid = option.vLineGrid || 10;
		
		// 可视、不可视 区域颜色
		this.visibleColor = option.visibleColor || new Cesium.Color( 0.0, 1.0, 0.0, 1.0 );
		this.invisibleColor = option.invisibleColor || new Cesium.Color( 1.0, 0.0, 0.0, 1.0 );

		// 投影区域透明度
		this.alpha = option.alpha || 0.8;

		// 视锥线颜色
		this.lineColor = option.lineColor || new Cesium.Color( 0.0, 1.0, 0.0, 1.0 );

		/** 子功能模块 */
		this.frustumVertex = new FrustumVertex();
		this.computeVertex();

		this.color = new Cesium.Color( 0.5, 0.5, 1.0, 1.0 );

		// 在这里先创建一个绘图指令
		const points = Cesium.Cartesian3.fromDegreesArrayHeights( [
			116.43095780355401, 39.868587750570875, 73.0,
			116.43115770427826, 39.867912894038040, 73.0,
			116.43232689460066, 39.868185203916380, 73.0,
		] ).flatMap( item => {
			const { x, y, z } = item;
			return [ x, y, z ];
		} );

		const positionBuffer = Cesium.Buffer.createVertexBuffer( {
			context: viewer.scene.context,
			typedArray: this.frustumVertex.getMeshVertices(),
			usage: Cesium.BufferUsage.STATIC_DRAW,
		} );

		const indexBuffer = Cesium.Buffer.createIndexBuffer( {
			context: viewer.scene.context,
			typedArray: this.frustumVertex.getMeshIndices(),
			usage: Cesium.BufferUsage.STATIC_DRAW,
			indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
		} );

		const attributes = [
			{
				index: 0,
				vertexBuffer: positionBuffer,
				componentsPerAttribute: 3,
				componentDatatype: Cesium.ComponentDatatype.FLOAT,
				offsetInBytes: 0,
				strideInBytes: 3 * 4,
				normalize: false,
			},
		];

		const attributeLocations = {
			position: 0,
		}

		const va = new Cesium.VertexArray( {
			context: viewer.scene.context,
			attributes: attributes,
			indexBuffer: indexBuffer,
		} );

		const uniformMap = {
			color: () => this.color,
		}

		const modelMatrix = new Cesium.Matrix4(
			1.0, 0.0, 0.0, 0.0,
			0.0, 1.0, 0.0, 0.0,
			0.0, 0.0, 1.0, 0.0,
			0.0, 0.0, 0.0, 1.0,
		);

		const shaderProgram = Cesium.ShaderProgram.fromCache( {
			context: viewer.scene.context,
			vertexShaderSource: `
				attribute vec3 position3DHigh;
				attribute vec3 position3DLow;
				attribute vec2 uv;

				vec4 computePosition( in vec3 positionHigh, in vec3 positionLow ) {
					vec3 high = positionHigh - czm_encodedCameraPositionMCHigh;
					vec3 low  = positionLow  - czm_encodedCameraPositionMCLow;
					return vec4( high + low, 1.0 );
				}

				void main() {
					vec4 position = czm_modelViewProjectionRelativeToEye * computePosition( position3DHigh, position3DLow );
					gl_Position = position;
				}
			`,
			fragmentShaderSource: `
			
				uniform vec4 color;
				void main() {
					gl_FragColor = color;
				}
			`,
			attributeLocations: attributeLocations,
		} );

		const renderState = new Cesium.RenderState( {
			cull: {
				enabled: false,
				face: Cesium.CullFace.BACK,
			},
			depthTest: {
				enabled: true,
			},
		} );

		const drawCommand = new Cesium.DrawCommand( {
			owner: this,
			vertexArray: va,
			uniformMap: uniformMap,
			shaderProgram: shaderProgram,
			primitiveType: Cesium.PrimitiveType.TRIANGLES,
			renderState: renderState,
			pass: Cesium.Pass.TERRAIN_CLASSIFICATION,
			modelMatrix: modelMatrix,
			castShadows: true,
		} );
		this.drawCommand = drawCommand;
	}

	update( frameState ) {
		frameState.commandList.push( this.drawCommand );
	}

	// 计算顶点
	computeVertex() {

		// 为了提高计算精度，不允许超过平角
		if ( this.hAngle >= 180.0 || this.vAngle >= 180.0 ) return;
		
		this.frustumVertex.compute(
			this.center, this.finish, this.realyRadius,
			this.hAngle*toRadian, this.vAngle*toRadian,
			this.hMeshGrid, this.vMeshGrid,
			this.hLineGrid, this.vLineGrid,
		);
	}
}

export default Viewshed;