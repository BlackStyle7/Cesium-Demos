/**
 * 快速创建一个测试用的 Cesium 环境
 * 关闭所有原生 UI 信息，仅提供地图视口
 */
const initTestCesium = container => {

	const viewer = new Cesium.Viewer( container, {
		animation: false,  // 关闭动画组件
		baseLayerPicker: false,  // 关闭底图组件
		fullscreenButton: false,  // 关闭全屏按钮
		vrButton: false,  // 关闭 vr 按钮
		geocoder: false,  // 关闭内置查询组件
		homeButton: false,  // 关闭 home 键
		infoBox: false,  // 关闭 info bos
		sceneModePicker: false,  // 关闭屏幕选取组件
		selectionIndicator: false,
		// timeline: false,  // 关闭时间轴
		navigationHelpButton: false,  // 关闭导航按钮
		navigationInstructionsInitiallyVisible: false,
		targetFrameRate: 60,  // 设置帧率

		terrainProvider: Cesium.createWorldTerrain(),
	} );

	// 去除底部 Logo
	const buttom = document.getElementsByClassName( 'cesium-viewer-bottom' )[ 0 ];
	buttom.style.display = 'none';
	return viewer;
}

export default initTestCesium;