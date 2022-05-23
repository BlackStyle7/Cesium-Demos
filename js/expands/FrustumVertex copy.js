const addDebugPoint = ( point, radius, color ) => {
	viewer.entities.add( 
		new Cesium.Entity( {
			position: point,
			point: new Cesium.PointGraphics( {
				pixelSize: radius,
				color: color,
			} ),
		} ),
	);
}

const addDebugLine = ( pointA, pointB, length, color ) => {

	const end = new Cesium.Cartesian3();
	Cesium.Cartesian3.subtract( pointB, pointA, end );
	Cesium.Cartesian3.normalize( end, end );
	Cesium.Cartesian3.multiplyByScalar( end, length, end );
	Cesium.Cartesian3.add( pointA, end, end );

	const primitive = new Cesium.Primitive( {
		geometryInstances: new Cesium.GeometryInstance( {
			geometry: new Cesium.PolylineGeometry( {
				positions: [ pointA, end ],//坐标必须两个和两个以上
				width: 1.0,
				vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
			} ),
			attributes: {
				color: Cesium.ColorGeometryInstanceAttribute.fromColor( color ),
			},
		} ),
		appearance: new Cesium.PolylineColorAppearance({
			translucent: false,
		}),
	} );
	viewer.scene.primitives.add( primitive );
}

const addDebugLineByD = ( point, d, length, color ) => {

	const end = new Cesium.Cartesian3();
	Cesium.Cartesian3.normalize( d, end );
	Cesium.Cartesian3.multiplyByScalar( end, length, end );
	Cesium.Cartesian3.add( point, end, end );
	addDebugLine( point, end, length, color );
}
const addDebugLineByP = ( pointA, pointB, length, color ) => {
	addDebugLine( pointA, pointB, length, color );
}

const toDegree = 180 / Math.PI;
const toRadian = Math.PI / 180;
const PI2 = Math.PI * 2;

/**
 * 该类用于维护视锥的顶点以及线索引和面索引
 */
const FrustumVertex = class {

	constructor() {

		// 用于存储计算过程中产生的中间量
		this.vecA = new Cesium.Cartesian3();
		this.vecB = new Cesium.Cartesian3();
		this.vecC = new Cesium.Cartesian3();
		this.vecD = new Cesium.Cartesian3();
		this.vec  = new Cesium.Cartesian3();
		this.llh  = new Cesium.Cartographic();

		// 局部坐标系统，使用列向量存储东北上坐标系轴
		this.localSystem = Cesium.Matrix3.clone( Cesium.Matrix3.IDENTITY, new Cesium.Matrix3() );

		// 旋转矩阵 A B, 过程量
		this.rotationMatrixA = Cesium.Matrix4.clone( Cesium.Matrix4.IDENTITY, new Cesium.Matrix4() );
		this.rotationMatrixB = Cesium.Matrix4.clone( Cesium.Matrix4.IDENTITY, new Cesium.Matrix4() );
		this.rotationMatrix  = Cesium.Matrix4.clone( Cesium.Matrix4.IDENTITY, new Cesium.Matrix4() );

		// 关键方向 @see computeKeyDirections
		this.keyDirections = [
			new Cesium.Cartesian3(),
			new Cesium.Cartesian3(),
			new Cesium.Cartesian3(),
			new Cesium.Cartesian3(),
		];

		// 存储顶点和索引计算中产生的过程量
		this.dataA = [];
		this.dataB = [];
		this.data  = [];

		// 视网面的顶点和索引
		this.meshHighVertices = [];
		this.meshLowVertices = [];
		this.meshIndices = [];

		// 视网线的顶点和索引
		this.lineVertices = [];
		this.lineIndices = [];
	}

	/**
	 * 三维笛卡尔坐标转经纬度坐标
	 */
	toCartographic( cartesian, result ) {
		Cesium.Cartographic.fromCartesian( cartesian, Cesium.Ellipsoid.WGS84, result );
		result.longitude *= toDegree;
		result.latitude *= toDegree;
	}

	/**
	 * 经纬度坐标转三维笛卡尔坐标
	 */
	toCartesian( cartographic, result ) {
		Cesium.Cartesian3.fromDegrees(
			cartographic.longitude,
			cartographic.latitude,
			cartographic.height,
			Cesium.Ellipsoid.WGS84,
			result,
		);
	}

	/**
	 * 获取 东北上 局部坐标系的坐标轴
	 */
	getLocalAxis( i = 0, result ) {
		return Cesium.Matrix3.getColumn( this.localSystem, i, result );
	}

	/**
	 * 计算局部 右前上 坐标系坐标轴方向
	 */
	computeLocalSystem( center, finish ) {

		// 将中心点转换为经纬度坐标
		this.toCartographic( center, this.llh );
		
		// 高度抬高1作为 up 方向点
		this.llh.height += 1;
		this.toCartesian( this.llh, this.vecA );
		this.llh.height -= 1;

		// up - center，即 up 方向，该方向为辅助方向
		Cesium.Cartesian3.subtract( this.vecA, center, this.vecA );
		Cesium.Cartesian3.normalize( this.vecA, this.vecA );

		// finish - center 即为 前 方向，将其存入分量 1 中
		Cesium.Cartesian3.subtract( finish, center, this.vecB );
		Cesium.Cartesian3.normalize( this.vecB, this.vecB );
		Cesium.Matrix3.setColumn( this.localSystem, 1, this.vecB, this.localSystem );
		// 此时 vecA 为上，vecB 为前

		// 前 X up = 右，存入分量 0 中
		Cesium.Cartesian3.cross( this.vecB, this.vecA, this.vecA );
		Cesium.Cartesian3.normalize( this.vecA, this.vecA );
		Cesium.Matrix3.setColumn( this.localSystem, 0, this.vecA, this.localSystem );
		// 此时 vecA 为右，vecB 为前

		// 右 X 前 = 上，存入分量 2 中
		Cesium.Cartesian3.cross( this.vecA, this.vecB, this.vecA );
		Cesium.Cartesian3.normalize( this.vecA, this.vecA );
		Cesium.Matrix3.setColumn( this.localSystem, 2, this.vecA, this.localSystem );
	}

	/**
	 * 生成任意轴旋转矩阵
	 */
	setRotationMatrix( axis, angle, matrix ) {

		const { x, y, z } = axis;
		const sin = Math.sin( angle ), cos = Math.cos( angle );
		const icos = 1.0 - cos;

		matrix[  0 ] = x*x * icos + 1*cos; matrix[  4 ] = y*x * icos + z*sin; matrix[  8 ] = z*x * icos - y*sin; matrix[ 12 ] = 0.0;
		matrix[  1 ] = x*y * icos - z*sin; matrix[  5 ] = y*y * icos + 1*cos; matrix[  9 ] = z*y * icos + x*sin; matrix[ 13 ] = 0.0;
		matrix[  2 ] = x*z * icos + y*sin; matrix[  6 ] = y*z * icos - x*sin; matrix[ 10 ] = z*z * icos + 1*cos; matrix[ 14 ] = 0.0;
		matrix[  3 ] =                0.0; matrix[  7 ] =                0.0; matrix[ 11 ] =                0.0; matrix[ 15 ] = 1.0;
	}

	/**
	 * 关键方向，即方向向量绕 +-hAngle 和 +-vAngle 后形成的 4 个方向向量，编号确定如下
	 *  1 ------------- 0
	 *  | center-finish |
	 *  2 ------------- 3
	 * 在 center 处，center-finish 方向看视网面形成的二位空间中，划分笛卡尔1，2，3，4象限
	 */
	computeKeyDirections( hAngle, vAngle ) {

		const hHalfAngle = hAngle / 2, vHalfAngle = vAngle / 2;
		const signs = [
			[ -1, +1 ], [ -1, -1 ],
			[ +1, -1 ], [ +1, +1 ],
		];

		for ( let i = 0, len = this.keyDirections.length; i < len; ++i ) {

			const [ signA, signB ] = signs[ i ];

			// 先绕右方向转 +-vAngle/2，存入 rotationMatrixA
			this.getLocalAxis( 0, this.vec );
			this.setRotationMatrix( this.vec, signA * vHalfAngle, this.rotationMatrixA );
	
			// 再绕上方向转 +-hAngle/2, 存入 rotationMatrixB
			this.getLocalAxis( 2, this.vec );
			this.setRotationMatrix( this.vec, signB * hHalfAngle, this.rotationMatrixB );
	
			// rotationMatrixB * rotationMatrixA 为最终旋转矩阵，存入 rotationMatrixA
			Cesium.Matrix4.multiply( this.rotationMatrixB, this.rotationMatrixA, this.rotationMatrixA );
	
			// 获取前方向，与之相乘
			this.getLocalAxis( 1, this.vec );
			Cesium.Matrix4.multiplyByPoint( this.rotationMatrixA, this.vec, this.keyDirections[ i ] );
		}
	}

	/**
	 * 计算插值顶点
	 * @param vecA <Cesium.Cartesian3> must 构成平面的基向量 A
	 * @param vecB <Cesium.Cartesian3> must 构成平面的基向量 B
	 * @param base <Cesium.Cartesian3> must 待旋转的基准点
	 * @param sign <Number> must, 角度缩放的常数
	 * @param angle <在当前平面内旋转的角度>
	 * @param grid <Number> must 当前扇形内的分段数
	 * @param result <Array> must 数据的存储结果
	 * @param startingIndex <Number> option 在 result 中开始存储的索引值
	 */
	computeInterpolationVertices( vecA, vecB, base, sign, angle, grid, result, startingIndex = 0 ) {

		// 计算向量 A,B 的法线
		Cesium.Cartesian3.cross( vecA, vecB, this.vecA );
		Cesium.Cartesian3.normalize( this.vecA, this.vecA );
		Cesium.Cartesian3.multiplyByScalar( this.vecA, sign, this.vecA );

		// 这里：this.vecA 为 vecA, vecB 法线，即旋转轴

		// 因为有 grid 个网格，所以有 grid+1 个顶点, 这里为了把+1体现出来，用的这种形式
		for ( let i = 0, len = grid + 1; i < len; ++i ) {

			// 获取旋转矩阵
			this.setRotationMatrix( this.vecA, angle * i / grid, this.rotationMatrix );
			// 旋转矩阵与基本向量相乘，得到目标点
			Cesium.Matrix4.multiplyByPoint( this.rotationMatrix, base, this.vecB );

			const { x, y, z } = this.vecB;

			result[ i * 3 + 0 + startingIndex ] = x;
			result[ i * 3 + 1 + startingIndex ] = y;
			result[ i * 3 + 2 + startingIndex ] = z;
		}
	}

	/**
	 * 计算各个顶点, 与关键方向具有相同的坐标系组织方法
	 * @see compute
	 */
	computeVertices( center, radius, hAngle, vAngle, hGrid, vGrid, high, low ) {

		/**
		 * 预处理计算，从关键方向中提取 0,3. 1,2. 组成基建对。
		 * 从Y轴正方向，向负方向计算
		 */

		// 清空结果和中间量
		high.splice( 0 ); high.length = ( ( hGrid+1 ) * ( vGrid+1 ) + 1 ) * 3;
		low.splice(  0 ); low.length  = ( ( hGrid+1 ) * ( vGrid+1 ) + 1 ) * 3;
		this.dataA.splice( 0 ); this.dataA.length = ( ( vGrid+1 ) ) * 3;
		this.dataB.splice( 0 ); this.dataB.length = ( ( vGrid+1 ) ) * 3;

		// 计算竖直方向插值
		this.computeInterpolationVertices( this.keyDirections[ 3 ], this.keyDirections[ 0 ], this.keyDirections[ 0 ], +1, vAngle, vGrid, this.dataA, 0 );
		this.computeInterpolationVertices( this.keyDirections[ 2 ], this.keyDirections[ 1 ], this.keyDirections[ 1 ], +1, vAngle, vGrid, this.dataB, 0 );

		// 将中心点添加
		high[ 0 ] = 0.0; high[ 1 ] = 0.0; high[ 2 ] = 0.0;

		// 计算水平方向插值
		for ( let i = 0, len = vGrid + 1; i < len; ++i ) {

			// 获取当前分量数据
			Cesium.Cartesian3.fromArray( this.dataA, i*3, this.vecC );
			Cesium.Cartesian3.fromArray( this.dataB, i*3, this.vecD );

			// 计算当前平面的旋转角
			const angle = Cesium.Cartesian3.angleBetween( this.vecC, this.vecD );

			// 在这个循环中 this.vecC, this.vecD 为当前平面的基，this.vecA是这个平面的法线，this.vecB 用于存储旋转后的结果
			this.computeInterpolationVertices( this.vecD, this.vecC, this.vecC, +1, angle, hGrid, high, ( ( vGrid + 1 ) * i +  1 ) * 3 );
		}

		// 将顶点放置到指定位置
		for ( let i = 0, len = high.length; i < len; i += 3 ) {

			high[ i + 0 ] = high[ i + 0 ] * radius + center.x;
			high[ i + 1 ] = high[ i + 1 ] * radius + center.y;
			high[ i + 2 ] = high[ i + 2 ] * radius + center.z;
		}

		// 清空中间量
		this.dataA.splice( 0 );
		this.dataB.splice( 0 );
	}

	computeIndex( h, v, hGrid, vGrid ) {

		return v * ( hGrid + 1 ) + h + 1;
	}

	/**
	 * 计算视网面顶点坐标
	 */
	computeMeshIndices( hGrid, vGrid, indices ) {

		indices.splice( 0 ); indices.length = ( hGrid + vGrid ) * 2 * 3 + hGrid * vGrid * 6;

		// 视锥上侧面
		let startingIndex = 0;
		for ( let h = 0, len = hGrid; h < len; ++h ) {
			indices[ h * 3 + 0 + startingIndex ] = 0;
			indices[ h * 3 + 1 + startingIndex ] = this.computeIndex( h + 0, 0, hGrid, vGrid );
			indices[ h * 3 + 2 + startingIndex ] = this.computeIndex( h + 1, 0, hGrid, vGrid ); 
		}

		// 视锥左侧面
		startingIndex += hGrid * 3;
		for ( let v = 0, len = vGrid; v < len; ++v ) {
			indices[ v * 3 + 0 + startingIndex ] = 0;
			indices[ v * 3 + 1 + startingIndex ] = this.computeIndex( hGrid, v + 0, hGrid, vGrid );
			indices[ v * 3 + 2 + startingIndex ] = this.computeIndex( hGrid, v + 1, hGrid, vGrid ); 
		}
	}

	/**
	 * 计算视锥各个顶点以及索引信息
	 * 注：所有的水平竖直均相对于东北上局部坐标系
	 * @param center <Cesium.Cartesian3> must 视锥起点
	 * @param finish <Cesium.Cartesian3> must 视锥终点
	 * @param radius <Number> must 视锥半径
	 * @param hAngle <Number> must 水平角度，弧度制，为了提高阴影计算精度，采取点光源计算，所以角度不应当大于 PI，
	 * @param vAngle <Number> must 竖直角度，弧度制，为了提高阴影计算精度，采取点光源计算，所以角度不应当大于 PI,
	 * @param hMeshGrid <Number> must 视网面 网格 水平分割个数
	 * @param vMeshGrid <Number> must 视网面 网格 竖直分割个数
	 * @param hLineGrid <Number> must 视网线 网格 水平分割个数
	 * @param vLineGrid <Number> must 视网线 网格 竖直分割个数
	 */
	compute( center, finish, radius, hAngle, vAngle, hMeshGrid, vMeshGrid, hLineGrid, vLineGrid ) {

		// 确定局部坐标系
		this.computeLocalSystem( center, finish );

		// 局部坐标系可视化
		this.getLocalAxis( 0, this.vec );
		addDebugLineByD( center, this.vec, 10, new Cesium.Color( 1.0, 0.0, 0.0, 1.0 ) );
		this.getLocalAxis( 1, this.vec );
		addDebugLineByD( center, this.vec, 10, new Cesium.Color( 0.0, 1.0, 0.0, 1.0 ) );
		this.getLocalAxis( 2, this.vec );
		addDebugLineByD( center, this.vec, 10, new Cesium.Color( 0.0, 0.0, 1.0, 1.0 ) );

		// 中心点可视化
		addDebugPoint( center, 5, new Cesium.Color( 1.0, 0.0, 0.0, 1.0 ) );

		// 计算四个关键角点方向
		this.computeKeyDirections( hAngle, vAngle );
		// 关键角点方向可视化
		for ( let i = 0, len = this.keyDirections.length; i < len; ++i ) {
			const ni = i+1;
			addDebugLineByD( center, this.keyDirections[ i ], radius, new Cesium.Color( 0.0 * ni, 0.25 * ni, 0.25 * ni, 1.0 ) );
		}

		// 视网面 顶点 索引 构建
		this.computeVertices( center, radius, hAngle, vAngle, hMeshGrid, vMeshGrid, this.meshHighVertices, this.meshLowVertices );
		this.computeMeshIndices( hMeshGrid, vMeshGrid, this.meshIndices );

		// // 视网面顶点可视化
		// for ( let h = 0, lenH = hMeshGrid+1; h < lenH; ++h ) {

		// 	for ( let v = 0, lenV = vMeshGrid+1; v < lenV; ++v ) {

		// 		const s =  v * lenV * 3 + 3 + h * 3;
		// 		const [ x, y, z ] = this.meshVertices.slice(
		// 			s,
		// 			s + 3,
		// 		);

		// 		const point = new Cesium.Cartesian3( x, y, z );
		// 		addDebugPoint( point, 5, new Cesium.Color( 1.0 * h / hMeshGrid, 1.0 * v / vMeshGrid, 0.0, 1.0 ) );
		// 	}
		// }
		
		// 视网线 顶点 索引 构建
		// this.computeVertices( center, radius, hAngle, vAngle, hLineGrid, vLineGrid, this.lineVertices );
		// for ( let h = 0, lenH = hLineGrid+1; h < lenH; ++h ) {

		// 	for ( let v = 0, lenV = vLineGrid+1; v < lenV; ++v ) {

		// 		const s =  v * lenV * 3 + 3 + h * 3;
		// 		const [ x, y, z ] = this.lineVertices.slice(
		// 			s,
		// 			s + 3,
		// 		);

		// 		const point = new Cesium.Cartesian3( x, y, z );
		// 		addDebugPoint( point, 5, new Cesium.Color( 1.0 * h / hLineGrid, 1.0 * v / vLineGrid, 0.0, 1.0 ) );
		// 	}
		// }

		// 还原中间量
		Cesium.Cartesian3.fromElements( 0, 0, 0, this.vecA );
		Cesium.Cartesian3.fromElements( 0, 0, 0, this.vecB );
		Cesium.Cartographic.fromRadians( 0, 0, 0, this.llh );
	}

	// 获取视网面顶点坐标
	getMeshVertices() {

		return new Float32Array( this.meshHighVertices );
	}

	// 获取视网面顶点索引
	getMeshIndices() {
		return new Uint16Array( this.meshIndices );
	}
}

export default FrustumVertex;