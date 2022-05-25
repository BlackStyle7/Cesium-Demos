import FrustumVertex from './FrustumVertex.js';
import FrustumLine from './FrustumLine.js';
import ShadowBodys from './ShadowBodys.js';

const toDegree = 180 / Math.PI;
const toRadian = Math.PI / 180;
const PI2 = Math.PI * 2;

/**
 * 视域分析类
 */
const Viewshed = class extends Cesium.PrimitiveCollection {

	constructor( viewer, option = {} ) {
		super();

		// 需要对 viewer 进行操作，故需要 viewer 环境
		this.viewer = viewer;

		/** 基础参数配置 */
		// 起点，终点，半径
		this.center = option.center;
		this.finish = option.finish;
		this.radius = option.radius;

		this.realyRadius = this.radius ?? Cesium.Cartesian3.distance( this.center, this.finish );

		// 水平、竖直角
		this.hAngle = option.hAngle || 120.0 * Math.PI / 180;
		this.vAngle = option.vAngle || 120.0 * Math.PI / 180;

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

		// 初始化视锥顶点计算器，并计算顶点索引
		this.frustumVertex = new FrustumVertex();
		this.frustumVertex.computeIndices( this.hMeshGrid, this.vMeshGrid, this.hLineGrid, this.vLineGrid );

		// 初始化视锥线和阴影体的维护对象，并初始化顶点索引
		// 因为在索引的组织结构不变的情况下，顶点个数是不会发生改变的，避免了缓冲区超限
		this.shadowBodys = this.add( new ShadowBodys( viewer, {
			hGrid: this.hMeshGrid,
			vGrid: this.vMeshGrid,
			visibleColor: this.visibleColor, invisibleColor: this.invisibleColor,
			indices: this.frustumVertex.getMeshIndices(),
		} ) );
		this.frustumLine = this.add( new FrustumLine( viewer, {
			hGrid: this.hLineGrid,
			vGrid: this.vLineGrid,
			color: this.lineColor,
			indices: this.frustumVertex.getLineIndices(),
		} ) );

		// 计算并更新顶点坐标
		this.updateVertices();
	}

	computeVertices() {
		this.frustumVertex.computeVertices(
			this.center, this.finish, this.realyRadius,
			this.hAngle, this.vAngle,
			this.hMeshGrid, this.vMeshGrid,
			this.hLineGrid, this.vLineGrid,
		);
	}

	// 计算并更新顶点坐标
	updateVertices() {
		this.computeVertices();
		this.shadowBodys.updateVertices( this.frustumVertex.getMeshVertices() );
		this.frustumLine.updateVertices( this.frustumVertex.getLineVertices() );
	}

	// update( frameState ) {
	// 	frameState.commandList.push( this.drawCommand );
	// }

	// postPassesUpdate() {
	// }
	// prePassesUpdate() {
	// }
	// updateForPass() {
	// }

}

export default Viewshed;