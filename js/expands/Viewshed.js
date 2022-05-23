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
		this.frustumVertex = new FrustumVertex();
		this.computeVertex();

		this.color = new Cesium.Color( 0.5, 0.5, 1.0, 1.0 );

		// 在这里先创建一个绘图指令

		const positionHighBuffer = Cesium.Buffer.createVertexBuffer( {
			context: viewer.scene.context,
			typedArray: this.frustumVertex.getMeshHighVertices(),
			usage: Cesium.BufferUsage.STATIC_DRAW,
		} );
		const positionLowBuffer = Cesium.Buffer.createVertexBuffer( {
			context: viewer.scene.context,
			typedArray: this.frustumVertex.getMeshLowVertices(),
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
				vertexBuffer: positionHighBuffer,
				componentsPerAttribute: 3,
				componentDatatype: Cesium.ComponentDatatype.FLOAT,
				offsetInBytes: 0,
				strideInBytes: 3 * 4,
				normalize: false,
			},
			{
				index: 1,
				vertexBuffer: positionLowBuffer,
				componentsPerAttribute: 3,
				componentDatatype: Cesium.ComponentDatatype.FLOAT,
				offsetInBytes: 0,
				strideInBytes: 3 * 4,
				normalize: false,
			},
		];

		const attributeLocations = {
			positionHigh: 0,
			positionLow: 1,
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
				enabled: true,
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
			// primitiveType: Cesium.PrimitiveType.LINES,
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
			this.hAngle, this.vAngle,
			this.hMeshGrid, this.vMeshGrid,
			this.hLineGrid, this.vLineGrid,
		);
	}
}

export default Viewshed;

const shader0 = {
	v: `
		#define EXTRUDED_GEOMETRY
		#define OES_texture_float_linear
		
		#define OES_texture_float\n\nfloat czm_signNotZero(float value)\n{\nreturn value >= 0.0 ? 1.0 : -1.0;\n}
		vec2 czm_signNotZero(vec2 value)\n{\nreturn vec2(czm_signNotZero(value.x), czm_signNotZero(value.y));\n}\nvec3 czm_signNotZero(vec3 value)\n{\nreturn vec3(czm_signNotZero(value.x), czm_signNotZero(value.y), czm_signNotZero(value.z));\n}\nvec4 czm_signNotZero(vec4 value)\n{\nreturn vec4(czm_signNotZero(value.x), czm_signNotZero(value.y), czm_signNotZero(value.z), czm_signNotZero(value.w));\n}\n\nuniform vec3 czm_encodedCameraPositionMCLow;\nuniform vec3 czm_encodedCameraPositionMCHigh;\nvec3 czm_octDecode(vec2 encoded, float range)\n{\nif (encoded.x == 0.0 && encoded.y == 0.0) {\nreturn vec3(0.0, 0.0, 0.0);\n}\nencoded = encoded / range * 2.0 - 1.0;\nvec3 v = vec3(encoded.x, encoded.y, 1.0 - abs(encoded.x) - abs(encoded.y));\nif (v.z < 0.0)\n{\nv.xy = (1.0 - abs(v.yx)) * czm_signNotZero(v.xy);\n}\nreturn normalize(v);\n}\nvec3 czm_octDecode(vec2 encoded)\n{\nreturn czm_octDecode(encoded, 255.0);\n}\nvec3 czm_octDecode(float encoded)\n{\nfloat temp = encoded / 256.0;\nfloat x = floor(temp);\nfloat y = (temp - x) * 256.0;\nreturn czm_octDecode(vec2(x, y));\n}\nvoid czm_octDecode(vec2 encoded, out vec3 vector1, out vec3 vector2, out vec3 vector3)\n{\nfloat temp = encoded.x / 65536.0;\nfloat x = floor(temp);\nfloat encodedFloat1 = (temp - x) * 65536.0;\ntemp = encoded.y / 65536.0;\nfloat y = floor(temp);\nfloat encodedFloat2 = (temp - y) * 65536.0;\nvector1 = czm_octDecode(encodedFloat1);\nvector2 = czm_octDecode(encodedFloat2);\nvector3 = czm_octDecode(vec2(x, y));\n}\n\nuniform vec2 czm_eyeHeight2D;\nconst float czm_sceneMode2D = 2.0;\n\nvec4 czm_columbusViewMorph(vec4 position2D, vec4 position3D, float time)\n{\nvec3 p = mix(position2D.xyz, position3D.xyz, time);\nreturn vec4(p, 1.0);\n}\n\nuniform float czm_morphTime;\nuniform mat4 czm_modelViewProjectionRelativeToEye;\n#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)\nvarying float v_WindowZ;\n#endif\nvec4 czm_depthClamp(vec4 coords)\n{\n#ifndef LOG_DEPTH\n#ifdef GL_EXT_frag_depth\nv_WindowZ = (0.5 * (coords.z / coords.w) + 0.5) * coords.w;\ncoords.z = 0.0;\n#else\ncoords.z = min(coords.z, coords.w);\n#endif\n#endif\nreturn coords;\n}\n\nuniform mat3 czm_normal;\nvec4 czm_translateRelativeToEye(vec3 high, vec3 low)\n{\nvec3 highDifference = high - czm_encodedCameraPositionMCHigh;\nvec3 lowDifference = low - czm_encodedCameraPositionMCLow;\nreturn vec4(highDifference + lowDifference, 1.0);\n}\n\nuniform mat4 czm_modelViewRelativeToEye;\nfloat czm_branchFreeTernary(bool comparison, float a, float b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec2 czm_branchFreeTernary(bool comparison, vec2 a, vec2 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec3 czm_branchFreeTernary(bool comparison, vec3 a, vec3 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec4 czm_branchFreeTernary(bool comparison, vec4 a, vec4 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\n\nconst float czm_sceneMode3D = 3.0;\n\nuniform float czm_sceneMode;\nuniform float czm_geometricToleranceOverMeter;\nvec4 czm_computePosition();\n\n\n\n#line 0\n\n#line 0\nattribute vec2 compressedAttributes;\nvec3 extrudeDirection;\n\n\nattribute vec3 position2DHigh;\nattribute vec3 position2DLow;\n\nattribute vec3 position3DHigh;\nattribute vec3 position3DLow;\nattribute float batchId;\n#ifdef EXTRUDED_GEOMETRY\n\nuniform float u_globeMinimumAltitude;\n#endif \n#ifdef PER_INSTANCE_COLOR\nvarying vec4 v_color;\n#endif \n#ifdef TEXTURE_COORDINATES\n#ifdef SPHERICAL\nvarying vec4 v_sphericalExtents;\n#else \nvarying vec2 v_inversePlaneExtents;\nvarying vec4 v_westPlane;\nvarying vec4 v_southPlane;\n#endif \nvarying vec3 v_uvMinAndSphericalLongitudeRotation;\nvarying vec3 v_uMaxAndInverseDistance;\nvarying vec3 v_vMaxAndInverseDistance;\n#endif \n\nuniform highp sampler2D batchTexture; \nuniform vec4 batchTextureStep; \nvec2 computeSt(float batchId) \n{ \n    float stepX = batchTextureStep.x; \n    float centerX = batchTextureStep.y; \n    float numberOfAttributes = float(17); \n    return vec2(centerX + (batchId * numberOfAttributes * stepX), 0.5); \n} \n\nvec4 czm_batchTable_uMaxVmax(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(0); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \n    return value; \n} \nvec4 czm_batchTable_uvMinAndExtents(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(1); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \n    return value; \n} \nvec3 czm_batchTable_southWest_HIGH(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(2); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec3 czm_batchTable_southWest_LOW(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(3); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec3 czm_batchTable_eastward(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(4); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec3 czm_batchTable_northward(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(5); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec4 czm_batchTable_planes2D_HIGH(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(6); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \n    return value; \n} \nvec4 czm_batchTable_planes2D_LOW(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(7); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \n    return value; \n} \nfloat czm_batchTable_show(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(8); \n    vec4 textureValue = texture2D(batchTexture, st); \n    float value = textureValue.x; \n    return value; \n} \nvec2 czm_batchTable_distanceDisplayCondition(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(9); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec2 value = textureValue.xy; \n    return value; \n} \nvec4 czm_batchTable_color(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(10); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \nvalue /= 255.0; \n    return value; \n} \nvec3 czm_batchTable_boundingSphereCenter3DHigh(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(11); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec3 czm_batchTable_boundingSphereCenter3DLow(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(12); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec3 czm_batchTable_boundingSphereCenter2DHigh(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(13); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec3 czm_batchTable_boundingSphereCenter2DLow(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(14); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nfloat czm_batchTable_boundingSphereRadius(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(15); \n    vec4 textureValue = texture2D(batchTexture, st); \n    float value = textureValue.x; \n    return value; \n} \nvec4 czm_batchTable_pickColor(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(16); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \nvalue /= 255.0; \n    return value; \n} \n\nvoid czm_non_distanceDisplayCondition_main()\n{\nvec4 position = czm_computePosition();\n#ifdef EXTRUDED_GEOMETRY\nfloat delta = min(u_globeMinimumAltitude, czm_geometricToleranceOverMeter * length(position.xyz));\ndelta *= czm_sceneMode == czm_sceneMode3D ? 1.0 : 0.0;\nposition = position + vec4(extrudeDirection * delta, 0.0);\n#endif\n#ifdef TEXTURE_COORDINATES\n#ifdef SPHERICAL\nv_sphericalExtents = czm_batchTable_sphericalExtents(batchId);\nv_uvMinAndSphericalLongitudeRotation.z = czm_batchTable_longitudeRotation(batchId);\n#else \n#ifdef COLUMBUS_VIEW_2D\nvec4 planes2D_high = czm_batchTable_planes2D_HIGH(batchId);\nvec4 planes2D_low = czm_batchTable_planes2D_LOW(batchId);\nvec2 idlSplitNewPlaneHiLow = vec2(EAST_MOST_X_HIGH - (WEST_MOST_X_HIGH - planes2D_high.w), EAST_MOST_X_LOW - (WEST_MOST_X_LOW - planes2D_low.w));\nbool idlSplit = planes2D_high.x > planes2D_high.w && position3DLow.y > 0.0;\nplanes2D_high.w = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.x, planes2D_high.w);\nplanes2D_low.w = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.y, planes2D_low.w);\nidlSplit = planes2D_high.x > planes2D_high.w && position3DLow.y < 0.0;\nidlSplitNewPlaneHiLow = vec2(WEST_MOST_X_HIGH - (EAST_MOST_X_HIGH - planes2D_high.x), WEST_MOST_X_LOW - (EAST_MOST_X_LOW - planes2D_low.x));\nplanes2D_high.x = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.x, planes2D_high.x);\nplanes2D_low.x = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.y, planes2D_low.x);
			vec3 southWestCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(vec3(0.0, planes2D_high.xy), vec3(0.0, planes2D_low.xy))).xyz;\nvec3 northWestCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(vec3(0.0, planes2D_high.x, planes2D_high.z), vec3(0.0, planes2D_low.x, planes2D_low.z))).xyz;\nvec3 southEastCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(vec3(0.0, planes2D_high.w, planes2D_high.y), vec3(0.0, planes2D_low.w, planes2D_low.y))).xyz;\n#else \nvec3 southWestCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(czm_batchTable_southWest_HIGH(batchId), czm_batchTable_southWest_LOW(batchId))).xyz;\nvec3 northWestCorner = czm_normal * czm_batchTable_northward(batchId) + southWestCorner;\nvec3 southEastCorner = czm_normal * czm_batchTable_eastward(batchId) + southWestCorner;\n#endif \nvec3 eastWard = southEastCorner - southWestCorner;\nfloat eastExtent = length(eastWard);\neastWard /= eastExtent;\nvec3 northWard = northWestCorner - southWestCorner;\nfloat northExtent = length(northWard);\nnorthWard /= northExtent;\nv_westPlane = vec4(eastWard, -dot(eastWard, southWestCorner));\nv_southPlane = vec4(northWard, -dot(northWard, southWestCorner));\nv_inversePlaneExtents = vec2(1.0 / eastExtent, 1.0 / northExtent);\n#endif \nvec4 uvMinAndExtents = czm_batchTable_uvMinAndExtents(batchId);\nvec4 uMaxVmax = czm_batchTable_uMaxVmax(batchId);\nv_uMaxAndInverseDistance = vec3(uMaxVmax.xy, uvMinAndExtents.z);\nv_vMaxAndInverseDistance = vec3(uMaxVmax.zw, uvMinAndExtents.w);\nv_uvMinAndSphericalLongitudeRotation.xy = uvMinAndExtents.xy;\n#endif \n#ifdef PER_INSTANCE_COLOR\nv_color = czm_batchTable_color(batchId);\n#endif\ngl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * position);\n}\n\nvoid czm_non_compressed_main() \n{ \n    czm_non_distanceDisplayCondition_main(); \n    vec2 distanceDisplayCondition = czm_batchTable_distanceDisplayCondition(batchId);\n    vec3 boundingSphereCenter3DHigh = czm_batchTable_boundingSphereCenter3DHigh(batchId);\n    vec3 boundingSphereCenter3DLow = czm_batchTable_boundingSphereCenter3DLow(batchId);\n    float boundingSphereRadius = czm_batchTable_boundingSphereRadius(batchId);\n    vec3 boundingSphereCenter2DHigh = czm_batchTable_boundingSphereCenter2DHigh(batchId);\n    vec3 boundingSphereCenter2DLow = czm_batchTable_boundingSphereCenter2DLow(batchId);\n    vec4 centerRTE;\n    if (czm_morphTime == 1.0)\n    {\n        centerRTE = czm_translateRelativeToEye(boundingSphereCenter3DHigh, boundingSphereCenter3DLow);\n    }\n    else if (czm_morphTime == 0.0)\n    {\n        centerRTE = czm_translateRelativeToEye(boundingSphereCenter2DHigh.zxy, boundingSphereCenter2DLow.zxy);\n    }\n    else\n    {\n        centerRTE = czm_columbusViewMorph(\n                czm_translateRelativeToEye(boundingSphereCenter2DHigh.zxy, boundingSphereCenter2DLow.zxy),\n                czm_translateRelativeToEye(boundingSphereCenter3DHigh, boundingSphereCenter3DLow),\n                czm_morphTime);\n    }\n    float radiusSq = boundingSphereRadius * boundingSphereRadius; \n    float distanceSq; \n    if (czm_sceneMode == czm_sceneMode2D) \n    { \n        distanceSq = czm_eyeHeight2D.y - radiusSq; \n    } \n    else \n    { \n        distanceSq = dot(centerRTE.xyz, centerRTE.xyz) - radiusSq; \n    } \n    distanceSq = max(distanceSq, 0.0); \n    float nearSq = distanceDisplayCondition.x * distanceDisplayCondition.x; \n    float farSq = distanceDisplayCondition.y * distanceDisplayCondition.y; \n    float show = (distanceSq >= nearSq && distanceSq <= farSq) ? 1.0 : 0.0; \n    gl_Position *= show; \n}\nvec4 czm_computePosition()\n{\n    vec4 p;\n    if (czm_morphTime == 1.0)\n    {\n        p = czm_translateRelativeToEye(position3DHigh, position3DLow);\n    }\n    else if (czm_morphTime == 0.0)\n    {\n        p = czm_translateRelativeToEye(position2DHigh.zxy, position2DLow.zxy);\n    }\n    else\n    {\n        p = czm_columbusViewMorph(\n                czm_translateRelativeToEye(position2DHigh.zxy, position2DLow.zxy),\n                czm_translateRelativeToEye(position3DHigh, position3DLow),\n                czm_morphTime);\n    }\n    return p;\n}\n\n\nvoid czm_non_show_main() \n{ \n    extrudeDirection = czm_octDecode(compressedAttributes, 65535.0);\n    czm_non_compressed_main(); \n}\nvoid main() \n{ \n    czm_non_show_main(); \n    gl_Position *= czm_batchTable_show(batchId); \n}
	`,
	f: `
		#extension GL_EXT_frag_depth : enable
		#ifdef GL_FRAGMENT_PRECISION_HIGH
			precision highp float;
			precision highp int;
		#else
			precision mediump float;
			precision mediump int;
			#define highp mediump
		#endif

		#define OES_texture_float_linear

		#define OES_texture_float

		uniform float czm_gamma;
		#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)
		varying float v_WindowZ;
		#endif
		void czm_writeDepthClamp()
		{
		#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)
		gl_FragDepthEXT = clamp(v_WindowZ * gl_FragCoord.w, 0.0, 1.0);
		#endif
		}

		vec3 czm_gammaCorrect(vec3 color) {
		#ifdef HDR
		color = pow(color, vec3(czm_gamma));
		#endif
		return color;
		}
		vec4 czm_gammaCorrect(vec4 color) {
		#ifdef HDR
		color.rgb = pow(color.rgb, vec3(czm_gamma));
		#endif
		return color;
		}



		#line 0

		#line 0
		#ifdef GL_EXT_frag_depth

		#endif
		#ifdef VECTOR_TILE
		uniform vec4 u_highlightColor;
		#endif
		void main(void)
		{
		#ifdef VECTOR_TILE
		gl_FragColor = czm_gammaCorrect(u_highlightColor);
		#else
		gl_FragColor = vec4(1.0);
		#endif
		czm_writeDepthClamp();
		}
	`,
}

const shader1 = {
	v: `
		#extension GL_EXT_frag_depth : enable\n#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp float;
		precision highp int;\n#else\n    precision mediump float;\n    precision mediump int;\n    #define highp mediump\n#endif\n\n#define REQUIRES_EC\n#define REQUIRES_WC\n#define TEXTURE_COORDINATES\n#define CULL_FRAGMENTS\n#define PER_INSTANCE_COLOR\n#define FLAT\n#define OES_texture_float_linear\n\n#define OES_texture_float\n\nconst float czm_epsilon2 = 0.01;\n\nconst float czm_pi = 3.141592653589793;\n\nconst float czm_piOverTwo = 1.5707963267948966;\n\nfloat czm_branchFreeTernary(bool comparison, float a, float b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec2 czm_branchFreeTernary(bool comparison, vec2 a, vec2 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec3 czm_branchFreeTernary(bool comparison, vec3 a, vec3 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec4 czm_branchFreeTernary(bool comparison, vec4 a, vec4 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\n\nuniform mat3 czm_normal3D;\nuniform vec3 czm_lightColor;\nconst float czm_sceneMode3D = 3.0;\n\nuniform float czm_sceneMode;\nfloat czm_getSpecular(vec3 lightDirectionEC, vec3 toEyeEC, vec3 normalEC, float shininess)\n{\nvec3 toReflectedLight = reflect(-lightDirectionEC, normalEC);\nfloat specular = max(dot(toReflectedLight, toEyeEC), 0.0);\nreturn pow(specular, max(shininess, czm_epsilon2));\n}\n\nfloat czm_getLambertDiffuse(vec3 lightDirectionEC, vec3 normalEC)\n{\nreturn max(dot(lightDirectionEC, normalEC), 0.0);\n}\n\nstruct czm_material\n{\nvec3 diffuse;\nfloat specular;\nfloat shininess;\nvec3 normal;\nvec3 emission;\nfloat alpha;\n};\n\nstruct czm_materialInput\n{\nfloat s;\nvec2 st;\nvec3 str;\nvec3 normalEC;\nmat3 tangentToEyeMatrix;\nvec3 positionToEyeEC;\nfloat height;\nfloat slope;\nfloat aspect;\n};\n\nuniform float czm_gamma;\nfloat czm_fastApproximateAtan(float x) {\nreturn x * (-0.1784 * x - 0.0663 * x * x + 1.0301);\n}\nfloat czm_fastApproximateAtan(float x, float y) {\nfloat t = abs(x);\nfloat opposite = abs(y);\nfloat adjacent = max(t, opposite);\nopposite = min(t, opposite);\nt = czm_fastApproximateAtan(opposite / adjacent);\nt = czm_branchFreeTernary(abs(y) > abs(x), czm_piOverTwo - t, t);\nt = czm_branchFreeTernary(x < 0.0, czm_pi - t, t);\nt = czm_branchFreeTernary(y < 0.0, -t, t);\nreturn t;\n}\n\nuniform float czm_log2FarDepthFromNearPlusOne;\nuniform vec2 czm_currentFrustum;\nuniform vec4 czm_frustumPlanes;\nuniform mat4 czm_inverseProjection;\nuniform mat4 czm_viewportTransformation;\nuniform vec4 czm_viewport;\nfloat czm_lineDistance(vec2 point1, vec2 point2, vec2 point) {\nreturn abs((point2.y - point1.y) * point.x - (point2.x - point1.x) * point.y + point2.x * point1.y - point2.y * point1.x) / distance(point2, point1);\n}\n\nmat3 czm_eastNorthUpToEyeCoordinates(vec3 positionMC, vec3 normalEC)\n{\nvec3 tangentMC = normalize(vec3(-positionMC.y, positionMC.x, 0.0));\nvec3 tangentEC = normalize(czm_normal3D * tangentMC);\nvec3 bitangentEC = normalize(cross(normalEC, tangentEC));\nreturn mat3(\ntangentEC.x,   tangentEC.y,   tangentEC.z,\nbitangentEC.x, bitangentEC.y, bitangentEC.z,\nnormalEC.x,    normalEC.y,    normalEC.z);\n}\n\nuniform vec3 czm_lightDirectionEC;\nfloat czm_private_getLambertDiffuseOfMaterial(vec3 lightDirectionEC, czm_material material)\n{\nreturn czm_getLambertDiffuse(lightDirectionEC, material.normal);\n}\nfloat czm_private_getSpecularOfMaterial(vec3 lightDirectionEC, vec3 toEyeEC, czm_material material)\n{\nreturn czm_getSpecular(lightDirectionEC, toEyeEC, material.normal, material.shininess);\n}\nvec4 czm_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)\n{\nfloat diffuse = czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 0.0, 1.0), material);\nif (czm_sceneMode == czm_sceneMode3D) {\ndiffuse += czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 1.0, 0.0), material);\n}\nfloat specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);\nvec3 materialDiffuse = material.diffuse * 0.5;\nvec3 ambient = materialDiffuse;\nvec3 color = ambient + material.emission;\ncolor += materialDiffuse * diffuse * czm_lightColor;\ncolor += material.specular * specular * czm_lightColor;\nreturn vec4(color, material.alpha);\n}\nvec4 czm_private_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)\n{\nfloat diffuse = czm_private_getLambertDiffuseOfMaterial(lightDirectionEC, material);\nfloat specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);\nvec3 ambient = vec3(0.0);\nvec3 color = ambient + material.emission;\ncolor += material.diffuse * diffuse * czm_lightColor;\ncolor += material.specular * specular * czm_lightColor;\nreturn vec4(color, material.alpha);\n}\n\nczm_material czm_getDefaultMaterial(czm_materialInput materialInput)\n{\nczm_material material;\nmaterial.diffuse = vec3(0.0);\nmaterial.specular = 0.0;\nmaterial.shininess = 1.0;\nmaterial.normal = materialInput.normalEC;\nmaterial.emission = vec3(0.0);\nmaterial.alpha = 1.0;\nreturn material;\n}\n\nvec3 czm_gammaCorrect(vec3 color) {\n#ifdef HDR\ncolor = pow(color, vec3(czm_gamma));\n#endif\nreturn color;\n}\nvec4 czm_gammaCorrect(vec4 color) {\n#ifdef HDR\ncolor.rgb = pow(color.rgb, vec3(czm_gamma));\n#endif\nreturn color;\n}\n\n#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)\nvarying float v_WindowZ;\n#endif\nvoid czm_writeDepthClamp()\n{\n#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)\ngl_FragDepthEXT = clamp(v_WindowZ * gl_FragCoord.w, 0.0, 1.0);\n#endif\n}\n\nfloat czm_planeDistance(vec4 plane, vec3 point) {\nreturn (dot(plane.xyz, point) + plane.w);\n}\nfloat czm_planeDistance(vec3 planeNormal, float planeDistance, vec3 point) {\nreturn (dot(planeNormal, point) + planeDistance);\n}\n\nconst float czm_twoPi = 6.283185307179586;\n\nvec2 czm_approximateSphericalCoordinates(vec3 normal) {\nfloat latitudeApproximation = czm_fastApproximateAtan(sqrt(normal.x * normal.x + normal.y * normal.y), normal.z);\nfloat longitudeApproximation = czm_fastApproximateAtan(normal.x, normal.y);\nreturn vec2(latitudeApproximation, longitudeApproximation);\n}\n\nuniform mat4 czm_inverseView;\nuniform sampler2D czm_globeDepthTexture;\nfloat czm_unpackDepth(vec4 packedDepth)\n{\nreturn dot(packedDepth, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));\n}\n\nvec4 czm_windowToEyeCoordinates(vec4 fragmentCoordinate)\n{\nfloat x = 2.0 * (fragmentCoordinate.x - czm_viewport.x) / czm_viewport.z - 1.0;\nfloat y = 2.0 * (fragmentCoordinate.y - czm_viewport.y) / czm_viewport.w - 1.0;\nfloat z = (fragmentCoordinate.z - czm_viewportTransformation[3][2]) / czm_viewportTransformation[2][2];\nvec4 q = vec4(x, y, z, 1.0);\nq /= fragmentCoordinate.w;\nif (!(czm_inverseProjection == mat4(0.0)))\n{\nq = czm_inverseProjection * q;\n}\nelse\n{\nfloat top = czm_frustumPlanes.x;\nfloat bottom = czm_frustumPlanes.y;\nfloat left = czm_frustumPlanes.z;\nfloat right = czm_frustumPlanes.w;\nfloat near = czm_currentFrustum.x;\nfloat far = czm_currentFrustum.y;\nq.x = (q.x * (right - left) + left + right) * 0.5;\nq.y = (q.y * (top - bottom) + bottom + top) * 0.5;\nq.z = (q.z * (near - far) - near - far) * 0.5;\nq.w = 1.0;\n}\nreturn q;\n}\nvec4 czm_windowToEyeCoordinates(vec2 fragmentCoordinateXY, float depthOrLogDepth)\n{\n#ifdef LOG_DEPTH\nfloat near = czm_currentFrustum.x;\nfloat far = czm_currentFrustum.y;\nfloat log2Depth = depthOrLogDepth * czm_log2FarDepthFromNearPlusOne;\nfloat depthFromNear = pow(2.0, log2Depth) - 1.0;\nfloat depthFromCamera = depthFromNear + near;\nvec4 windowCoord = vec4(fragmentCoordinateXY, far * (1.0 - near / depthFromCamera) / (far - near), 1.0);\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(windowCoord);\neyeCoordinate.w = 1.0 / depthFromCamera;\nreturn eyeCoordinate;\n#else\nvec4 windowCoord = vec4(fragmentCoordinateXY, depthOrLogDepth, 1.0);\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(windowCoord);\n#endif\nreturn eyeCoordinate;\n}\n\n\n\n#line 0\n\n#line 0\n\n#line 0\n#ifdef GL_EXT_frag_depth\n\n#endif\n#ifdef TEXTURE_COORDINATES\n#ifdef SPHERICAL\nvarying vec4 v_sphericalExtents;\n#else \nvarying vec2 v_inversePlaneExtents;\nvarying vec4 v_westPlane;\nvarying vec4 v_southPlane;\n#endif \nvarying vec3 v_uvMinAndSphericalLongitudeRotation;\nvarying vec3 v_uMaxAndInverseDistance;\nvarying vec3 v_vMaxAndInverseDistance;\n#endif \n#ifdef PER_INSTANCE_COLOR\nvarying vec4 v_color;\n#endif\n#ifdef NORMAL_EC\nvec3 getEyeCoordinate3FromWindowCoordinate(vec2 fragCoord, float logDepthOrDepth) {\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(fragCoord, logDepthOrDepth);\nreturn eyeCoordinate.xyz / eyeCoordinate.w;\n}\nvec3 vectorFromOffset(vec4 eyeCoordinate, vec2 positiveOffset) {\nvec2 glFragCoordXY = gl_FragCoord.xy;\nfloat upOrRightLogDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, (glFragCoordXY + positiveOffset) / czm_viewport.zw));\nfloat downOrLeftLogDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, (glFragCoordXY - positiveOffset) / czm_viewport.zw));\nbvec2 upOrRightInBounds = lessThan(glFragCoordXY + positiveOffset, czm_viewport.zw);\nfloat useUpOrRight = float(upOrRightLogDepth > 0.0 && upOrRightInBounds.x && upOrRightInBounds.y);\nfloat useDownOrLeft = float(useUpOrRight == 0.0);\nvec3 upOrRightEC = getEyeCoordinate3FromWindowCoordinate(glFragCoordXY + positiveOffset, upOrRightLogDepth);\nvec3 downOrLeftEC = getEyeCoordinate3FromWindowCoordinate(glFragCoordXY - positiveOffset, downOrLeftLogDepth);\nreturn (upOrRightEC - (eyeCoordinate.xyz / eyeCoordinate.w)) * useUpOrRight + ((eyeCoordinate.xyz / eyeCoordinate.w) - downOrLeftEC) * useDownOrLeft;\n}\n#endif \nvoid main(void)\n{\n#ifdef REQUIRES_EC\nfloat logDepthOrDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, logDepthOrDepth);\n#endif\n#ifdef REQUIRES_WC\nvec4 worldCoordinate4 = czm_inverseView * eyeCoordinate;
		vec3 worldCoordinate = worldCoordinate4.xyz / worldCoordinate4.w;\n#endif\n#ifdef TEXTURE_COORDINATES\nvec2 uv;\n#ifdef SPHERICAL\nvec2 sphericalLatLong = czm_approximateSphericalCoordinates(worldCoordinate);\nsphericalLatLong.y += v_uvMinAndSphericalLongitudeRotation.z;\nsphericalLatLong.y = czm_branchFreeTernary(sphericalLatLong.y < czm_pi, sphericalLatLong.y, sphericalLatLong.y - czm_twoPi);\nuv.x = (sphericalLatLong.y - v_sphericalExtents.y) * v_sphericalExtents.w;\nuv.y = (sphericalLatLong.x - v_sphericalExtents.x) * v_sphericalExtents.z;\n#else \nuv.x = czm_planeDistance(v_westPlane, eyeCoordinate.xyz / eyeCoordinate.w) * v_inversePlaneExtents.x;\nuv.y = czm_planeDistance(v_southPlane, eyeCoordinate.xyz / eyeCoordinate.w) * v_inversePlaneExtents.y;\n#endif \n#endif \n#ifdef PICK\n#ifdef CULL_FRAGMENTS\nif (0.0 <= uv.x && uv.x <= 1.0 && 0.0 <= uv.y && uv.y <= 1.0 || logDepthOrDepth != 0.0) {\ngl_FragColor.a = 1.0;\nczm_writeDepthClamp();\n}\n#else \ngl_FragColor.a = 1.0;\n#endif \n#else \n#ifdef CULL_FRAGMENTS\nif (uv.x <= 0.0 || 1.0 <= uv.x || uv.y <= 0.0 || 1.0 <= uv.y || logDepthOrDepth == 0.0) {\ndiscard;\n}\n#endif\n#ifdef NORMAL_EC\nvec3 downUp = vectorFromOffset(eyeCoordinate, vec2(0.0, 1.0));\nvec3 leftRight = vectorFromOffset(eyeCoordinate, vec2(1.0, 0.0));\nvec3 normalEC = normalize(cross(leftRight, downUp));\n#endif\n#ifdef PER_INSTANCE_COLOR\nvec4 color = czm_gammaCorrect(v_color);\n#ifdef FLAT\ngl_FragColor = color;\n#else \nczm_materialInput materialInput;\nmaterialInput.normalEC = normalEC;\nmaterialInput.positionToEyeEC = -eyeCoordinate.xyz;\nczm_material material = czm_getDefaultMaterial(materialInput);\nmaterial.diffuse = color.rgb;\nmaterial.alpha = color.a;\ngl_FragColor = czm_phong(normalize(-eyeCoordinate.xyz), material, czm_lightDirectionEC);\n#endif \ngl_FragColor.rgb *= gl_FragColor.a;\n#else \nczm_materialInput materialInput;\n#ifdef USES_NORMAL_EC\nmaterialInput.normalEC = normalEC;\n#endif\n#ifdef USES_POSITION_TO_EYE_EC\nmaterialInput.positionToEyeEC = -eyeCoordinate.xyz;\n#endif\n#ifdef USES_TANGENT_TO_EYE\nmaterialInput.tangentToEyeMatrix = czm_eastNorthUpToEyeCoordinates(worldCoordinate, normalEC);\n#endif\n#ifdef USES_ST\nmaterialInput.st.x = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_uMaxAndInverseDistance.xy, uv) * v_uMaxAndInverseDistance.z;\nmaterialInput.st.y = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_vMaxAndInverseDistance.xy, uv) * v_vMaxAndInverseDistance.z;\n#endif\nczm_material material = czm_getMaterial(materialInput);\n#ifdef FLAT\ngl_FragColor = vec4(material.diffuse + material.emission, material.alpha);\n#else \ngl_FragColor = czm_phong(normalize(-eyeCoordinate.xyz), material, czm_lightDirectionEC);\n#endif \ngl_FragColor.rgb *= gl_FragColor.a;\n#endif \nczm_writeDepthClamp();\n#endif \n}\n
	`,
	f: `
		#extension GL_EXT_frag_depth : enable\n#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp float;\n    precision highp int;\n#else\n    precision mediump float;\n    precision mediump int;\n    #define highp mediump\n#endif\n\n#define REQUIRES_EC\n#define REQUIRES_WC\n#define TEXTURE_COORDINATES\n#define CULL_FRAGMENTS\n#define PER_INSTANCE_COLOR\n#define FLAT\n#define OES_texture_float_linear\n\n#define OES_texture_float\n\nconst float czm_epsilon2 = 0.01;\n\nconst float czm_pi = 3.141592653589793;\n\nconst float czm_piOverTwo = 1.5707963267948966;\n\nfloat czm_branchFreeTernary(bool comparison, float a, float b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec2 czm_branchFreeTernary(bool comparison, vec2 a, vec2 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec3 czm_branchFreeTernary(bool comparison, vec3 a, vec3 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec4 czm_branchFreeTernary(bool comparison, vec4 a, vec4 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\n\nuniform mat3 czm_normal3D;\nuniform vec3 czm_lightColor;\nconst float czm_sceneMode3D = 3.0;\n\nuniform float czm_sceneMode;\nfloat czm_getSpecular(vec3 lightDirectionEC, vec3 toEyeEC, vec3 normalEC, float shininess)\n{\nvec3 toReflectedLight = reflect(-lightDirectionEC, normalEC);\nfloat specular = max(dot(toReflectedLight, toEyeEC), 0.0);\nreturn pow(specular, max(shininess, czm_epsilon2));\n}\n\nfloat czm_getLambertDiffuse(vec3 lightDirectionEC, vec3 normalEC)\n{\nreturn max(dot(lightDirectionEC, normalEC), 0.0);\n}\n\nstruct czm_material\n{\nvec3 diffuse;\nfloat specular;\nfloat shininess;\nvec3 normal;\nvec3 emission;\nfloat alpha;\n};\n\nstruct czm_materialInput\n{\nfloat s;\nvec2 st;\nvec3 str;\nvec3 normalEC;\nmat3 tangentToEyeMatrix;\nvec3 positionToEyeEC;\nfloat height;\nfloat slope;\nfloat aspect;\n};\n\nuniform float czm_gamma;\nfloat czm_fastApproximateAtan(float x) {\nreturn x * (-0.1784 * x - 0.0663 * x * x + 1.0301);\n}\nfloat czm_fastApproximateAtan(float x, float y) {\nfloat t = abs(x);\nfloat opposite = abs(y);\nfloat adjacent = max(t, opposite);\nopposite = min(t, opposite);\nt = czm_fastApproximateAtan(opposite / adjacent);\nt = czm_branchFreeTernary(abs(y) > abs(x), czm_piOverTwo - t, t);\nt = czm_branchFreeTernary(x < 0.0, czm_pi - t, t);\nt = czm_branchFreeTernary(y < 0.0, -t, t);\nreturn t;\n}\n\nuniform float czm_log2FarDepthFromNearPlusOne;\nuniform vec2 czm_currentFrustum;\nuniform vec4 czm_frustumPlanes;\nuniform mat4 czm_inverseProjection;\nuniform mat4 czm_viewportTransformation;\nuniform vec4 czm_viewport;\nfloat czm_lineDistance(vec2 point1, vec2 point2, vec2 point) {\nreturn abs((point2.y - point1.y) * point.x - (point2.x - point1.x) * point.y + point2.x * point1.y - point2.y * point1.x) / distance(point2, point1);\n}\n\nmat3 czm_eastNorthUpToEyeCoordinates(vec3 positionMC, vec3 normalEC)\n{\nvec3 tangentMC = normalize(vec3(-positionMC.y, positionMC.x, 0.0));\nvec3 tangentEC = normalize(czm_normal3D * tangentMC);\nvec3 bitangentEC = normalize(cross(normalEC, tangentEC));\nreturn mat3(\ntangentEC.x,   tangentEC.y,   tangentEC.z,\nbitangentEC.x, bitangentEC.y, bitangentEC.z,\nnormalEC.x,    normalEC.y,    normalEC.z);\n}\n\nuniform vec3 czm_lightDirectionEC;\nfloat czm_private_getLambertDiffuseOfMaterial(vec3 lightDirectionEC, czm_material material)\n{\nreturn czm_getLambertDiffuse(lightDirectionEC, material.normal);\n}\nfloat czm_private_getSpecularOfMaterial(vec3 lightDirectionEC, vec3 toEyeEC, czm_material material)\n{\nreturn czm_getSpecular(lightDirectionEC, toEyeEC, material.normal, material.shininess);\n}\nvec4 czm_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)\n{\nfloat diffuse = czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 0.0, 1.0), material);\nif (czm_sceneMode == czm_sceneMode3D) {\ndiffuse += czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 1.0, 0.0), material);\n}\nfloat specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);\nvec3 materialDiffuse = material.diffuse * 0.5;\nvec3 ambient = materialDiffuse;\nvec3 color = ambient + material.emission;\ncolor += materialDiffuse * diffuse * czm_lightColor;\ncolor += material.specular * specular * czm_lightColor;\nreturn vec4(color, material.alpha);\n}\nvec4 czm_private_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)\n{\nfloat diffuse = czm_private_getLambertDiffuseOfMaterial(lightDirectionEC, material);\nfloat specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);\nvec3 ambient = vec3(0.0);\nvec3 color = ambient + material.emission;\ncolor += material.diffuse * diffuse * czm_lightColor;\ncolor += material.specular * specular * czm_lightColor;\nreturn vec4(color, material.alpha);\n}\n\nczm_material czm_getDefaultMaterial(czm_materialInput materialInput)\n{\nczm_material material;\nmaterial.diffuse = vec3(0.0);\nmaterial.specular = 0.0;\nmaterial.shininess = 1.0;\nmaterial.normal = materialInput.normalEC;\nmaterial.emission = vec3(0.0);\nmaterial.alpha = 1.0;\nreturn material;\n}\n\nvec3 czm_gammaCorrect(vec3 color) {\n#ifdef HDR\ncolor = pow(color, vec3(czm_gamma));\n#endif\nreturn color;\n}\nvec4 czm_gammaCorrect(vec4 color) {\n#ifdef HDR\ncolor.rgb = pow(color.rgb, vec3(czm_gamma));\n#endif\nreturn color;\n}\n\n#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)\nvarying float v_WindowZ;\n#endif\nvoid czm_writeDepthClamp()\n{\n#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)\ngl_FragDepthEXT = clamp(v_WindowZ * gl_FragCoord.w, 0.0, 1.0);\n#endif\n}\n\nfloat czm_planeDistance(vec4 plane, vec3 point) {\nreturn (dot(plane.xyz, point) + plane.w);\n}\nfloat czm_planeDistance(vec3 planeNormal, float planeDistance, vec3 point) {\nreturn (dot(planeNormal, point) + planeDistance);\n}\n\nconst float czm_twoPi = 6.283185307179586;\n\nvec2 czm_approximateSphericalCoordinates(vec3 normal) {\nfloat latitudeApproximation = czm_fastApproximateAtan(sqrt(normal.x * normal.x + normal.y * normal.y), normal.z);\nfloat longitudeApproximation = czm_fastApproximateAtan(normal.x, normal.y);\nreturn vec2(latitudeApproximation, longitudeApproximation);\n}\n\nuniform mat4 czm_inverseView;\nuniform sampler2D czm_globeDepthTexture;\nfloat czm_unpackDepth(vec4 packedDepth)\n{\nreturn dot(packedDepth, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));\n}\n\nvec4 czm_windowToEyeCoordinates(vec4 fragmentCoordinate)\n{\nfloat x = 2.0 * (fragmentCoordinate.x - czm_viewport.x) / czm_viewport.z - 1.0;\nfloat y = 2.0 * (fragmentCoordinate.y - czm_viewport.y) / czm_viewport.w - 1.0;\nfloat z = (fragmentCoordinate.z - czm_viewportTransformation[3][2]) / czm_viewportTransformation[2][2];\nvec4 q = vec4(x, y, z, 1.0);\nq /= fragmentCoordinate.w;\nif (!(czm_inverseProjection == mat4(0.0)))\n{\nq = czm_inverseProjection * q;\n}\nelse\n{\nfloat top = czm_frustumPlanes.x;\nfloat bottom = czm_frustumPlanes.y;\nfloat left = czm_frustumPlanes.z;\nfloat right = czm_frustumPlanes.w;\nfloat near = czm_currentFrustum.x;\nfloat far = czm_currentFrustum.y;\nq.x = (q.x * (right - left) + left + right) * 0.5;\nq.y = (q.y * (top - bottom) + bottom + top) * 0.5;\nq.z = (q.z * (near - far) - near - far) * 0.5;\nq.w = 1.0;\n}\nreturn q;\n}\nvec4 czm_windowToEyeCoordinates(vec2 fragmentCoordinateXY, float depthOrLogDepth)\n{\n#ifdef LOG_DEPTH\nfloat near = czm_currentFrustum.x;\nfloat far = czm_currentFrustum.y;\nfloat log2Depth = depthOrLogDepth * czm_log2FarDepthFromNearPlusOne;\nfloat depthFromNear = pow(2.0, log2Depth) - 1.0;\nfloat depthFromCamera = depthFromNear + near;\nvec4 windowCoord = vec4(fragmentCoordinateXY, far * (1.0 - near / depthFromCamera) / (far - near), 1.0);\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(windowCoord);\neyeCoordinate.w = 1.0 / depthFromCamera;\nreturn eyeCoordinate;\n#else\nvec4 windowCoord = vec4(fragmentCoordinateXY, depthOrLogDepth, 1.0);\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(windowCoord);\n#endif\nreturn eyeCoordinate;\n}\n\n\n\n#line 0\n\n#line 0\n\n#line 0\n#ifdef GL_EXT_frag_depth\n\n#endif\n#ifdef TEXTURE_COORDINATES\n#ifdef SPHERICAL\nvarying vec4 v_sphericalExtents;\n#else \nvarying vec2 v_inversePlaneExtents;\nvarying vec4 v_westPlane;\nvarying vec4 v_southPlane;\n#endif \nvarying vec3 v_uvMinAndSphericalLongitudeRotation;\nvarying vec3 v_uMaxAndInverseDistance;\nvarying vec3 v_vMaxAndInverseDistance;\n#endif \n#ifdef PER_INSTANCE_COLOR\nvarying vec4 v_color;\n#endif\n#ifdef NORMAL_EC\nvec3 getEyeCoordinate3FromWindowCoordinate(vec2 fragCoord, float logDepthOrDepth) {\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(fragCoord, logDepthOrDepth);\nreturn eyeCoordinate.xyz / eyeCoordinate.w;\n}\nvec3 vectorFromOffset(vec4 eyeCoordinate, vec2 positiveOffset) {\nvec2 glFragCoordXY = gl_FragCoord.xy;\nfloat upOrRightLogDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, (glFragCoordXY + positiveOffset) / czm_viewport.zw));\nfloat downOrLeftLogDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, (glFragCoordXY - positiveOffset) / czm_viewport.zw));\nbvec2 upOrRightInBounds = lessThan(glFragCoordXY + positiveOffset, czm_viewport.zw);\nfloat useUpOrRight = float(upOrRightLogDepth > 0.0 && upOrRightInBounds.x && upOrRightInBounds.y);\nfloat useDownOrLeft = float(useUpOrRight == 0.0);\nvec3 upOrRightEC = getEyeCoordinate3FromWindowCoordinate(glFragCoordXY + positiveOffset, upOrRightLogDepth);\nvec3 downOrLeftEC = getEyeCoordinate3FromWindowCoordinate(glFragCoordXY - positiveOffset, downOrLeftLogDepth);\nreturn (upOrRightEC - (eyeCoordinate.xyz / eyeCoordinate.w)) * useUpOrRight + ((eyeCoordinate.xyz / eyeCoordinate.w) - downOrLeftEC) * useDownOrLeft;\n}\n#endif \nvoid main(void)\n{\n#ifdef REQUIRES_EC\nfloat logDepthOrDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
		vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, logDepthOrDepth);\n#endif\n#ifdef REQUIRES_WC\nvec4 worldCoordinate4 = czm_inverseView * eyeCoordinate;\nvec3 worldCoordinate = worldCoordinate4.xyz / worldCoordinate4.w;\n#endif\n#ifdef TEXTURE_COORDINATES\nvec2 uv;\n#ifdef SPHERICAL\nvec2 sphericalLatLong = czm_approximateSphericalCoordinates(worldCoordinate);\nsphericalLatLong.y += v_uvMinAndSphericalLongitudeRotation.z;\nsphericalLatLong.y = czm_branchFreeTernary(sphericalLatLong.y < czm_pi, sphericalLatLong.y, sphericalLatLong.y - czm_twoPi);\nuv.x = (sphericalLatLong.y - v_sphericalExtents.y) * v_sphericalExtents.w;\nuv.y = (sphericalLatLong.x - v_sphericalExtents.x) * v_sphericalExtents.z;\n#else \nuv.x = czm_planeDistance(v_westPlane, eyeCoordinate.xyz / eyeCoordinate.w) * v_inversePlaneExtents.x;\nuv.y = czm_planeDistance(v_southPlane, eyeCoordinate.xyz / eyeCoordinate.w) * v_inversePlaneExtents.y;\n#endif \n#endif \n#ifdef PICK\n#ifdef CULL_FRAGMENTS\nif (0.0 <= uv.x && uv.x <= 1.0 && 0.0 <= uv.y && uv.y <= 1.0 || logDepthOrDepth != 0.0) {\ngl_FragColor.a = 1.0;\nczm_writeDepthClamp();\n}\n#else \ngl_FragColor.a = 1.0;\n#endif \n#else \n#ifdef CULL_FRAGMENTS\nif (uv.x <= 0.0 || 1.0 <= uv.x || uv.y <= 0.0 || 1.0 <= uv.y || logDepthOrDepth == 0.0) {\ndiscard;\n}\n#endif\n#ifdef NORMAL_EC\nvec3 downUp = vectorFromOffset(eyeCoordinate, vec2(0.0, 1.0));\nvec3 leftRight = vectorFromOffset(eyeCoordinate, vec2(1.0, 0.0));\nvec3 normalEC = normalize(cross(leftRight, downUp));\n#endif\n#ifdef PER_INSTANCE_COLOR\nvec4 color = czm_gammaCorrect(v_color);\n#ifdef FLAT\ngl_FragColor = color;\n#else \nczm_materialInput materialInput;\nmaterialInput.normalEC = normalEC;\nmaterialInput.positionToEyeEC = -eyeCoordinate.xyz;\nczm_material material = czm_getDefaultMaterial(materialInput);\nmaterial.diffuse = color.rgb;\nmaterial.alpha = color.a;\ngl_FragColor = czm_phong(normalize(-eyeCoordinate.xyz), material, czm_lightDirectionEC);\n#endif \ngl_FragColor.rgb *= gl_FragColor.a;\n#else \nczm_materialInput materialInput;\n#ifdef USES_NORMAL_EC\nmaterialInput.normalEC = normalEC;\n#endif\n#ifdef USES_POSITION_TO_EYE_EC\nmaterialInput.positionToEyeEC = -eyeCoordinate.xyz;\n#endif\n#ifdef USES_TANGENT_TO_EYE\nmaterialInput.tangentToEyeMatrix = czm_eastNorthUpToEyeCoordinates(worldCoordinate, normalEC);\n#endif\n#ifdef USES_ST\nmaterialInput.st.x = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_uMaxAndInverseDistance.xy, uv) * v_uMaxAndInverseDistance.z;\nmaterialInput.st.y = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_vMaxAndInverseDistance.xy, uv) * v_vMaxAndInverseDistance.z;\n#endif\nczm_material material = czm_getMaterial(materialInput);\n#ifdef FLAT\ngl_FragColor = vec4(material.diffuse + material.emission, material.alpha);\n#else \ngl_FragColor = czm_phong(normalize(-eyeCoordinate.xyz), material, czm_lightDirectionEC);\n#endif \ngl_FragColor.rgb *= gl_FragColor.a;\n#endif \nczm_writeDepthClamp();\n#endif \n}\n"
	`,
}

const r0 = {
	blending: {
		color: {red: 0, green: 0, blue: 0, alpha: 0},
		enabled: false,
		equationAlpha: 32774,
		equationRgb: 32774,
		functionDestinationAlpha: 0,
		functionDestinationRgb: 0,
		functionSourceAlpha: 1,
		functionSourceRgb: 1,
	},
	colorMask: {red: false, green: false, blue: false, alpha: false},
	cull: {enabled: false, face: 1029},
	depthMask: false,
	depthRange: {near: 0, far: 1},
	depthTest: {enabled: true, func: 515},
	frontFace: 2305,
	polygonOffset: {enabled: false, factor: 0, units: 0},
	sampleCoverage: {enabled: false, value: 1, invert: false},
	scissorTest: {
		enabled: false,
		rectangle: {x: 0, y: 0, width: 0, height: 0},
	},
	stencilMask: 15,
	stencilTest: {
		backFunction: 519,
		backOperation: {fail: 7680, zFail: 34055, zPass: 7680},
		enabled: true,
		frontFunction: 519,
		frontOperation: {fail: 7680, zFail: 34056, zPass: 7680},
		mask: 128,
		reference: 128,
	},
}

const r1 = {
	blending: {
		color: {red: 0, green: 0, blue: 0, alpha: 0},
		enabled: false,
		equationAlpha: 32774,
		equationRgb: 32774,
		functionDestinationAlpha: 0,
		functionDestinationRgb: 0,
		functionSourceAlpha: 1,
		functionSourceRgb: 1,
	},
	colorMask: {red: false, green: false, blue: false, alpha: false},
	cull: {enabled: false, face: 1029},
	depthMask: false,
	depthRange: {near: 0, far: 1},
	depthTest: {enabled: true, func: 515},
	frontFace: 2305,
	polygonOffset: {enabled: false, factor: 0, units: 0},
	sampleCoverage: {enabled: false, value: 1, invert: false},
	scissorTest: {
		enabled: false,
		rectangle: {x: 0, y: 0, width: 0, height: 0},
	},
	stencilMask: 15,
	stencilTest: {
		backFunction: 514,
		backOperation: {fail: 7680, zFail: 34055, zPass: 7680},
		enabled: true,
		frontFunction: 514,
		frontOperation: {fail: 7680, zFail: 34056, zPass: 7680},
		mask: 128,
		reference: 128,
	},
}

const r2 = {
	blending: {
		color: {red: 0, green: 0, blue: 0, alpha: 0},
		enabled: true,
		equationAlpha: 32774,
		equationRgb: 32774,
		functionDestinationAlpha: 771,
		functionDestinationRgb: 771,
		functionSourceAlpha: 1,
		functionSourceRgb: 1,
	},
	colorMask: {red: true, green: true, blue: true, alpha: true},
	cull: {enabled: false, face: 1029},
	depthMask: false,
	depthRange: {near: 0, far: 1},
	depthTest: {enabled: false, func: 513},
	frontFace: 2305,
	polygonOffset: {enabled: false, factor: 0, units: 0},
	sampleCoverage: {enabled: false, value: 1, invert: false},
	scissorTest: {
		enabled: false,
		rectangle: {x: 0, y: 0, width: 0, height: 0},
	},
	stencilMask: 15,
	stencilTest: {
		backFunction: 517,
		backOperation: {fail: 0, zFail: 0, zPass: 0},
		enabled: true,
		frontFunction: 517,
		frontOperation: {fail: 0, zFail: 0, zPass: 0},
		mask: 15,
		reference: 0,
	},
}