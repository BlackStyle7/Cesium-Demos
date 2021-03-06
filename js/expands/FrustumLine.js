/**
 * 用于视锥线的可视化
 */
const FrustumLine = class {

	constructor( viewer, option = {} ) {

		const { hGrid, vGrid, indices, color } = option;

		this.viewer = viewer;

		// 因为顶点个数不允许改变，所以总数居长度可以预计算
		this.sizeInBytes = ( ( hGrid + 1 ) * ( vGrid + 1 ) + 1 ) * 3 * Float32Array.BYTES_PER_ELEMENT;
		this.color = color;
		
		// 因为后续需要动态修改这两个值，所以将其显式暴露出来
		this.positionHighBuffer = this.initVertexBuffer();
		this.positionLowBuffer  = this.initVertexBuffer();

		this.modelMatrix = Cesium.Matrix4.clone( Cesium.Matrix4.IDENTITY, new Cesium.Matrix4() );

		this.drawCommand = this.initDrawCommand( indices );
	}

	initVertexBuffer() {

		const { context } = this.viewer.scene;

		const buffer = Cesium.Buffer.createVertexBuffer( {
			context: context,
			sizeInBytes: this.sizeInBytes,
			usage: Cesium.BufferUsage.DYNAMIC_DRAW,
		} );

		return buffer;
	}

	initIndexBuffer( indices ) {

		const { context } = this.viewer.scene;

		const buffer = Cesium.Buffer.createIndexBuffer( {
			context: context,
			typedArray: indices,
			usage: Cesium.BufferUsage.STATIC_DRAW,
			indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
		} );

		return buffer;
	}

	initVertexArray( indices ) {

		const { context } = this.viewer.scene;
		const indexBuffer = this.initIndexBuffer( indices );

		const vertexArray = new Cesium.VertexArray( {
			context: context,
			indexBuffer: indexBuffer,
			attributes: [
				{
					index: 0,
					vertexBuffer: this.positionHighBuffer,
					componentsPerAttribute: 3,
					componentDatatype: Cesium.ComponentDatatype.FLOAT,
					offsetInBytes: 0,
					strideInBytes: 3 * 4,
					normalize: false,
				},
				{
					index: 1,
					vertexBuffer: this.positionLowBuffer,
					componentsPerAttribute: 3,
					componentDatatype: Cesium.ComponentDatatype.FLOAT,
					offsetInBytes: 0,
					strideInBytes: 3 * 4,
					normalize: false,
				},
			],
		} );

		return vertexArray;
	}


	static vShaderSource = `
		attribute vec3 positionHigh;
		attribute vec3 positionLow;
		attribute vec2 uv;

		vec4 computePosition( in vec3 positionHigh, in vec3 positionLow ) {
			vec3 high = positionHigh - czm_encodedCameraPositionMCHigh;
			vec3 low  = positionLow  - czm_encodedCameraPositionMCLow;
			return vec4( high + low, 1.0 );
		}

		void main() {
			vec4 position = czm_modelViewProjectionRelativeToEye * computePosition( positionHigh, positionLow );
			gl_Position = position;
		}
	`;
	static fShaderSource = `
			
		uniform vec4 color;
		void main() {
			gl_FragColor = color;
		}
	`;
	initShaderProgram() {

		const shaderProgram = Cesium.ShaderProgram.fromCache( {
			context: viewer.scene.context,
			vertexShaderSource: FrustumLine.vShaderSource,
			fragmentShaderSource: FrustumLine.fShaderSource,
			attributeLocations: {
				positionHigh: 0,
				positionLow:  1,
			},
		} );

		return shaderProgram;
	}

	initDrawCommand( indices ) {

		const drawCommand = new Cesium.DrawCommand( {
			owner: this,
			vertexArray: this.initVertexArray( indices ),
			uniformMap: {
				color: () => this.color,
			},
			shaderProgram: this.initShaderProgram(),
			primitiveType: Cesium.PrimitiveType.LINES,
			renderState: new Cesium.RenderState( {
				cull: {
					enabled: true,
					face: Cesium.CullFace.BACK,
				},
				depthTest: {
					enabled: true,
				},
			} ),
			pass: Cesium.Pass.TERRAIN_CLASSIFICATION,
			modelMatrix: this.modelMatrix,
			castShadows: false,
		} );

		return drawCommand;
	}

	// 更新顶点坐标
	updateVertices( vertices ) {

		this.positionHighBuffer.copyFromArrayView( vertices.high );
		this.positionLowBuffer.copyFromArrayView( vertices.low );
	}

	update( frameState ) {
		frameState.commandList.push( this.drawCommand );
	}
}

export default FrustumLine;