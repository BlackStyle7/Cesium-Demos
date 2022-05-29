import ShadowBody from './ShadowBody.js';

/**
 * 该组件用于维护各个渲染通道 pass 的阴影体
 */
 const ShadowBodys = class {

	constructor( viewer, option = {} ) {

		const { hGrid, vGrid, indices, visibleColor, invisibleColor } = option;

		this.viewer = viewer;

		// 因为顶点个数不允许改变，所以总数居长度可以预计算
		this.sizeInBytes = ( ( hGrid + 1 ) * ( vGrid + 1 ) + 1 ) * 3 * Float32Array.BYTES_PER_ELEMENT;
		this.visibleColor = visibleColor;
		this.invisibleColor = invisibleColor;
		
		// 因为后续需要动态修改这两个值，所以将其显式暴露出来
		this.positionHighBuffer = this.initVertexBuffer();
		this.positionLowBuffer  = this.initVertexBuffer();

		// 创建顶点数组
		this.vertexArray = this.initVertexArray( indices );

		// 创建模板着色器程序
		this.stencilShaderProgram = Cesium.ShaderProgram.fromCache( {
			context: viewer.scene.context,
			vertexShaderSource: `
				attribute vec3 positionHigh;
				attribute vec3 positionLow;
		
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

				void main() {
					gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 );
				}
			`,
			attributeLocations: {
				positionHigh: 0,
				positionLow:  1,
			},
		} );

		// 创建渲染着色器程序
		this.renderShaderProgram = Cesium.ShaderProgram.fromCache( {
			context: viewer.scene.context,
			vertexShaderSource: `
				attribute vec3 positionHigh;
				attribute vec3 positionLow;
		
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

				uniform vec4 visibleColor;
				uniform vec4 invisibleColor;
				void main() {
					float alpha = 0.2;
					gl_FragColor = visibleColor * alpha;
				}
			`,
			attributeLocations: {
				positionHigh: 0,
				positionLow:  1,
			},
		} );

		this.shaderPrograms = [
			Cesium.ShaderProgram.fromCache( {
				context: viewer.scene.context,
				vertexShaderSource: `
					// attribute vec3 positionHigh;
					// attribute vec3 positionLow;
			
					// vec4 computePosition( in vec3 positionHigh, in vec3 positionLow ) {
					// 	vec3 high = positionHigh - czm_encodedCameraPositionMCHigh;
					// 	vec3 low  = positionLow  - czm_encodedCameraPositionMCLow;
					// 	return vec4( high + low, 1.0 );
					// }
			
					// void main() {
					// 	vec4 position = czm_modelViewProjectionRelativeToEye * computePosition( positionHigh, positionLow );
					// 	gl_Position = position;
					// }
					
					attribute vec3 positionHigh;
					attribute vec3 positionLow;
					
					void main() {
						vec4 position = czm_translateRelativeToEye(positionHigh, positionLow);

						gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * position);
					}
				`,
				
				fragmentShaderSource: `
	
					// #extension GL_EXT_frag_depth : enable
					// uniform vec4 visibleColor;
					// uniform vec4 invisibleColor;
					// void main() {
					// 	float alpha = 0.2;
					// 	gl_FragColor = visibleColor * alpha;
					// }

					#extension GL_EXT_frag_depth : enable
					
					void main(void) {
						gl_FragColor = vec4( 1.0 );
						czm_writeDepthClamp();
					}
				`,
				attributeLocations: {
					positionHigh: 0,
					positionLow:  1,
				},
			} ),
			Cesium.ShaderProgram.fromCache( {
				context: viewer.scene.context,
				vertexShaderSource: `
					// attribute vec3 positionHigh;
					// attribute vec3 positionLow;
			
					// vec4 computePosition( in vec3 positionHigh, in vec3 positionLow ) {
					// 	vec3 high = positionHigh - czm_encodedCameraPositionMCHigh;
					// 	vec3 low  = positionLow  - czm_encodedCameraPositionMCLow;
					// 	return vec4( high + low, 1.0 );
					// }
			
					// void main() {
					// 	vec4 position = czm_modelViewProjectionRelativeToEye * computePosition( positionHigh, positionLow );
					// 	gl_Position = position;
					// }
					

					#define EXTRUDED_GEOMETRY
					#define PER_INSTANCE_COLOR
					#define TEXTURE_COORDINATES
					#define OES_texture_float_linear
					
					#define OES_texture_float
					
					float czm_signNotZero(float value) {
						return value >= 0.0 ? 1.0 : -1.0;
					}
					vec2 czm_signNotZero(vec2 value) {
						return vec2(czm_signNotZero(value.x), czm_signNotZero(value.y));
					}
					vec3 czm_signNotZero(vec3 value) {
						return vec3(czm_signNotZero(value.x), czm_signNotZero(value.y), czm_signNotZero(value.z));
					}
					vec4 czm_signNotZero(vec4 value) {
						return vec4(czm_signNotZero(value.x), czm_signNotZero(value.y), czm_signNotZero(value.z), czm_signNotZero(value.w));
					}
					
					uniform vec3 czm_encodedCameraPositionMCLow;
					uniform vec3 czm_encodedCameraPositionMCHigh;
					vec3 czm_octDecode(vec2 encoded, float range) {
						if (encoded.x == 0.0 && encoded.y == 0.0) {
							return vec3(0.0, 0.0, 0.0);
						}
						encoded = encoded / range * 2.0 - 1.0;
						vec3 v = vec3(encoded.x, encoded.y, 1.0 - abs(encoded.x) - abs(encoded.y));
						if (v.z < 0.0) {
							v.xy = (1.0 - abs(v.yx)) * czm_signNotZero(v.xy);
						}
						return normalize(v);
					}
					vec3 czm_octDecode(vec2 encoded) {
						return czm_octDecode(encoded, 255.0);
					}
					vec3 czm_octDecode(float encoded) {
						float temp = encoded / 256.0;
						float x = floor(temp);
						float y = (temp - x) * 256.0;
						return czm_octDecode(vec2(x, y));
					}
					void czm_octDecode(vec2 encoded, out vec3 vector1, out vec3 vector2, out vec3 vector3) {
						float temp = encoded.x / 65536.0;
						float x = floor(temp);
						float encodedFloat1 = (temp - x) * 65536.0;
						temp = encoded.y / 65536.0;
						float y = floor(temp);
						float encodedFloat2 = (temp - y) * 65536.0;
						vector1 = czm_octDecode(encodedFloat1);
						vector2 = czm_octDecode(encodedFloat2);
						vector3 = czm_octDecode(vec2(x, y));
					}
					
					vec4 czm_columbusViewMorph(vec4 position2D, vec4 position3D, float time) {
						vec3 p = mix(position2D.xyz, position3D.xyz, time);
						return vec4(p, 1.0);
					}
					
					uniform float czm_morphTime;
					uniform mat4 czm_modelViewProjectionRelativeToEye;
					#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)
						varying float v_WindowZ;
					#endif
					vec4 czm_depthClamp(vec4 coords) {
						#ifndef LOG_DEPTH
							#ifdef GL_EXT_frag_depth
								v_WindowZ = (0.5 * (coords.z / coords.w) + 0.5) * coords.w;
								coords.z = 0.0;
							#else
								coords.z = min(coords.z, coords.w);
							#endif
						#endif
						return coords;
					}
					
					uniform mat3 czm_normal;
					vec4 czm_translateRelativeToEye(vec3 high, vec3 low) {
						vec3 highDifference = high - czm_encodedCameraPositionMCHigh;
						vec3 lowDifference = low - czm_encodedCameraPositionMCLow;
						return vec4(highDifference + lowDifference, 1.0);
					}
					
					uniform mat4 czm_modelViewRelativeToEye;
					float czm_branchFreeTernary(bool comparison, float a, float b) {
						float useA = float(comparison);
						return a * useA + b * (1.0 - useA);
					}
					vec2 czm_branchFreeTernary(bool comparison, vec2 a, vec2 b) {
						float useA = float(comparison);
						return a * useA + b * (1.0 - useA);
					}
					vec3 czm_branchFreeTernary(bool comparison, vec3 a, vec3 b) {
						float useA = float(comparison);
						return a * useA + b * (1.0 - useA);
					}
					vec4 czm_branchFreeTernary(bool comparison, vec4 a, vec4 b) {
						float useA = float(comparison);
						return a * useA + b * (1.0 - useA);
					}
					
					const float czm_sceneMode3D = 3.0;
					
					uniform float czm_sceneMode;
					uniform float czm_geometricToleranceOverMeter;
					vec4 czm_computePosition();
					
					
					
					#line 0
					
					#line 0
					attribute vec2 compressedAttributes;
					vec3 extrudeDirection;
					
					
					attribute vec3 position2DHigh;
					attribute vec3 position2DLow;
					
					attribute vec3 position3DHigh;
					ttribute vec3 position3DLow;
					attribute float batchId;
					#ifdef EXTRUDED_GEOMETRY
						uniform float u_globeMinimumAltitude;
					#endif
					#ifdef PER_INSTANCE_COLOR
						varying vec4 v_color;
					#endif
					#ifdef TEXTURE_COORDINATES
						#ifdef SPHERICAL
							varying vec4 v_sphericalExtents;
						#else
							varying vec2 v_inversePlaneExtents;
							varying vec4 v_westPlane;
							varying vec4 v_southPlane;
						#endif
						varying vec3 v_uvMinAndSphericalLongitudeRotation;
						varying vec3 v_uMaxAndInverseDistance;
						varying vec3 v_vMaxAndInverseDistance;
					endif
					
					uniform highp sampler2D batchTexture;
					uniform vec4 batchTextureStep;
					vec2 computeSt(float batchId) {
						float stepX = batchTextureStep.x;
						float centerX = batchTextureStep.y;
						float numberOfAttributes = float(10);
						return vec2(centerX + (batchId * numberOfAttributes * stepX), 0.5);
					}
					
					vec4 czm_batchTable_uMaxVmax(float batchId) {
						vec2 st = computeSt(batchId);
						st.x += batchTextureStep.x * float(0);
						vec4 textureValue = texture2D(batchTexture, st);
						vec4 value = textureValue;
						return value;
					}
					vec4 czm_batchTable_uvMinAndExtents(float batchId) {
						vec2 st = computeSt(batchId);
						st.x += batchTextureStep.x * float(1);
						vec4 textureValue = texture2D(batchTexture, st);
						vec4 value = textureValue;
						return value;
					}
					vec3 czm_batchTable_southWest_HIGH(float batchId) {
						vec2 st = computeSt(batchId);
						st.x += batchTextureStep.x * float(2);
						vec4 textureValue = texture2D(batchTexture, st);
						vec3 value = textureValue.xyz;
						return value;
					}
					vec3 czm_batchTable_southWest_LOW(float batchId) {
						vec2 st = computeSt(batchId);
						st.x += batchTextureStep.x * float(3);
						vec4 textureValue = texture2D(batchTexture, st);
						vec3 value = textureValue.xyz;
						return value;
					}
					vec3 czm_batchTable_eastward(float batchId) {
						vec2 st = computeSt(batchId);
						st.x += batchTextureStep.x * float(4);
						vec4 textureValue = texture2D(batchTexture, st);
						vec3 value = textureValue.xyz;
						return value;
					}
					vec3 czm_batchTable_northward(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(5); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec3 value = textureValue.xyz; \n    return value; \n} \nvec4 czm_batchTable_planes2D_HIGH(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(6); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \n    return value; \n} \nvec4 czm_batchTable_planes2D_LOW(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(7); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \n    return value; \n} \nvec4 czm_batchTable_color(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(8); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \nvalue /= 255.0; \n    return value; \n} \nvec4 czm_batchTable_pickColor(float batchId) \n{ \n    vec2 st = computeSt(batchId); \n    st.x += batchTextureStep.x * float(9); \n    vec4 textureValue = texture2D(batchTexture, st); \n    vec4 value = textureValue; \nvalue /= 255.0; \n    return value; \n} \n\nvoid czm_non_compressed_main()\n{\nvec4 position = czm_computePosition();\n#ifdef EXTRUDED_GEOMETRY\nfloat delta = min(u_globeMinimumAltitude, czm_geometricToleranceOverMeter * length(position.xyz));\ndelta *= czm_sceneMode == czm_sceneMode3D ? 1.0 : 0.0;\nposition = position + vec4(extrudeDirection * delta, 0.0);\n#endif\n#ifdef TEXTURE_COORDINATES\n#ifdef SPHERICAL\nv_sphericalExtents = czm_batchTable_sphericalExtents(batchId);\nv_uvMinAndSphericalLongitudeRotation.z = czm_batchTable_longitudeRotation(batchId);\n#else \n#ifdef COLUMBUS_VIEW_2D\nvec4 planes2D_high = czm_batchTable_planes2D_HIGH(batchId);\nvec4 planes2D_low = czm_batchTable_planes2D_LOW(batchId);\nvec2 idlSplitNewPlaneHiLow = vec2(EAST_MOST_X_HIGH - (WEST_MOST_X_HIGH - planes2D_high.w), EAST_MOST_X_LOW - (WEST_MOST_X_LOW - planes2D_low.w));\nbool idlSplit = planes2D_high.x > planes2D_high.w && position3DLow.y > 0.0;\nplanes2D_high.w = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.x, planes2D_high.w);\nplanes2D_low.w = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.y, planes2D_low.w);\nidlSplit = planes2D_high.x > planes2D_high.w && position3DLow.y < 0.0;\nidlSplitNewPlaneHiLow = vec2(WEST_MOST_X_HIGH - (EAST_MOST_X_HIGH - planes2D_high.x), WEST_MOST_X_LOW - (EAST_MOST_X_LOW - planes2D_low.x));\nplanes2D_high.x = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.x, planes2D_high.x);\nplanes2D_low.x = czm_branchFreeTernary(idlSplit, idlSplitNewPlaneHiLow.y, planes2D_low.x);\nvec3 southWestCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(vec3(0.0, planes2D_high.xy), vec3(0.0, planes2D_low.xy))).xyz;\nvec3 northWestCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(vec3(0.0, planes2D_high.x, planes2D_high.z), vec3(0.0, planes2D_low.x, planes2D_low.z))).xyz;\nvec3 southEastCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(vec3(0.0, planes2D_high.w, planes2D_high.y), vec3(0.0, planes2D_low.w, planes2D_low.y))).xyz;\n#else \nvec3 southWestCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(czm_batchTable_southWest_HIGH(batchId), czm_batchTable_southWest_LOW(batchId))).xyz;\nvec3 northWestCorner = czm_normal * czm_batchTable_northward(batchId) + southWestCorner;\nvec3 southEastCorner = czm_normal * czm_batchTable_eastward(batchId) + southWestCorner;\n#endif \nvec3 eastWard = southEastCorner - southWestCorner;\nfloat eastExtent = length(eastWard);\neastWard /= eastExtent;\nvec3 northWard = northWestCorner - southWestCorner;\nfloat northExtent = length(northWard);\nnorthWard /= northExtent;\nv_westPlane = vec4(eastWard, -dot(eastWard, southWestCorner));\nv_southPlane = vec4(northWard, -dot(northWard, southWestCorner));\nv_inversePlaneExtents = vec2(1.0 / eastExtent, 1.0 / northExtent);\n#endif \nvec4 uvMinAndExtents = czm_batchTable_uvMinAndExtents(batchId);\nvec4 uMaxVmax = czm_batchTable_uMaxVmax(batchId);\nv_uMaxAndInverseDistance = vec3(uMaxVmax.xy, uvMinAndExtents.z);\nv_vMaxAndInverseDistance = vec3(uMaxVmax.zw, uvMinAndExtents.w);\nv_uvMinAndSphericalLongitudeRotation.xy = uvMinAndExtents.xy;\n#endif \n#ifdef PER_INSTANCE_COLOR
					v_color = czm_batchTable_color(batchId);\n#endif\ngl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * position);\n}\n\nvec4 czm_computePosition()\n{\n    vec4 p;\n    if (czm_morphTime == 1.0)\n    {\n        p = czm_translateRelativeToEye(position3DHigh, position3DLow);\n    }\n    else if (czm_morphTime == 0.0)\n    {\n        p = czm_translateRelativeToEye(position2DHigh.zxy, position2DLow.zxy);\n    }\n    else\n    {\n        p = czm_columbusViewMorph(\n                czm_translateRelativeToEye(position2DHigh.zxy, position2DLow.zxy),\n                czm_translateRelativeToEye(position3DHigh, position3DLow),\n                czm_morphTime);\n    }\n    return p;\n}\n\n\nvoid main() \n{ \n    extrudeDirection = czm_octDecode(compressedAttributes, 65535.0);\n    czm_non_compressed_main(); \n}
			
				`,
				fragmentShaderSource: `
	
					uniform vec4 visibleColor;
					uniform vec4 invisibleColor;
					void main() {
						float alpha = 0.2;
						gl_FragColor = visibleColor * alpha;
					}
				`,

				// #extension GL_EXT_frag_depth : enable\n#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp float;\n    precision highp int;\n#else\n    precision mediump float;\n    precision mediump int;\n    #define highp mediump\n#endif\n\n#define REQUIRES_EC\n#define REQUIRES_WC\n#define TEXTURE_COORDINATES\n#define CULL_FRAGMENTS\n#define PER_INSTANCE_COLOR\n#define FLAT\n#define OES_texture_float_linear\n\n#define OES_texture_float\n\nconst float czm_epsilon2 = 0.01;\n\nconst float czm_pi = 3.141592653589793;\n\nconst float czm_piOverTwo = 1.5707963267948966;\n\nfloat czm_branchFreeTernary(bool comparison, float a, float b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec2 czm_branchFreeTernary(bool comparison, vec2 a, vec2 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec3 czm_branchFreeTernary(bool comparison, vec3 a, vec3 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\nvec4 czm_branchFreeTernary(bool comparison, vec4 a, vec4 b) {\nfloat useA = float(comparison);\nreturn a * useA + b * (1.0 - useA);\n}\n\nuniform mat3 czm_normal3D;\nuniform vec3 czm_lightColor;\nconst float czm_sceneMode3D = 3.0;\n\nuniform float czm_sceneMode;\nfloat czm_getSpecular(vec3 lightDirectionEC, vec3 toEyeEC, vec3 normalEC, float shininess)\n{\nvec3 toReflectedLight = reflect(-lightDirectionEC, normalEC);\nfloat specular = max(dot(toReflectedLight, toEyeEC), 0.0);\nreturn pow(specular, max(shininess, czm_epsilon2));\n}\n\nfloat czm_getLambertDiffuse(vec3 lightDirectionEC, vec3 normalEC)\n{\nreturn max(dot(lightDirectionEC, normalEC), 0.0);\n}\n\nstruct czm_material\n{\nvec3 diffuse;\nfloat specular;\nfloat shininess;\nvec3 normal;\nvec3 emission;\nfloat alpha;\n};\n\nstruct czm_materialInput\n{\nfloat s;\nvec2 st;\nvec3 str;\nvec3 normalEC;\nmat3 tangentToEyeMatrix;\nvec3 positionToEyeEC;\nfloat height;\nfloat slope;\nfloat aspect;\n};\n\nuniform float czm_gamma;\nfloat czm_fastApproximateAtan(float x) {\nreturn x * (-0.1784 * x - 0.0663 * x * x + 1.0301);\n}\nfloat czm_fastApproximateAtan(float x, float y) {\nfloat t = abs(x);\nfloat opposite = abs(y);\nfloat adjacent = max(t, opposite);\nopposite = min(t, opposite);\nt = czm_fastApproximateAtan(opposite / adjacent);\nt = czm_branchFreeTernary(abs(y) > abs(x), czm_piOverTwo - t, t);\nt = czm_branchFreeTernary(x < 0.0, czm_pi - t, t);\nt = czm_branchFreeTernary(y < 0.0, -t, t);\nreturn t;\n}\n\nuniform float czm_log2FarDepthFromNearPlusOne;\nuniform vec2 czm_currentFrustum;\nuniform vec4 czm_frustumPlanes;\nuniform mat4 czm_inverseProjection;\nuniform mat4 czm_viewportTransformation;\nuniform vec4 czm_viewport;\nfloat czm_lineDistance(vec2 point1, vec2 point2, vec2 point) {\nreturn abs((point2.y - point1.y) * point.x - (point2.x - point1.x) * point.y + point2.x * point1.y - point2.y * point1.x) / distance(point2, point1);\n}\n\nmat3 czm_eastNorthUpToEyeCoordinates(vec3 positionMC, vec3 normalEC)\n{\nvec3 tangentMC = normalize(vec3(-positionMC.y, positionMC.x, 0.0));\nvec3 tangentEC = normalize(czm_normal3D * tangentMC);\nvec3 bitangentEC = normalize(cross(normalEC, tangentEC));\nreturn mat3(\ntangentEC.x,   tangentEC.y,   tangentEC.z,\nbitangentEC.x, bitangentEC.y, bitangentEC.z,\nnormalEC.x,    normalEC.y,    normalEC.z);\n}\n\nuniform vec3 czm_lightDirectionEC;\nfloat czm_private_getLambertDiffuseOfMaterial(vec3 lightDirectionEC, czm_material material)\n{\nreturn czm_getLambertDiffuse(lightDirectionEC, material.normal);\n}\nfloat czm_private_getSpecularOfMaterial(vec3 lightDirectionEC, vec3 toEyeEC, czm_material material)\n{\nreturn czm_getSpecular(lightDirectionEC, toEyeEC, material.normal, material.shininess);\n}\nvec4 czm_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)\n{\nfloat diffuse = czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 0.0, 1.0), material);\nif (czm_sceneMode == czm_sceneMode3D) {\ndiffuse += czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 1.0, 0.0), material);\n}\nfloat specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);\nvec3 materialDiffuse = material.diffuse * 0.5;\nvec3 ambient = materialDiffuse;\nvec3 color = ambient + material.emission;\ncolor += materialDiffuse * diffuse * czm_lightColor;\ncolor += material.specular * specular * czm_lightColor;\nreturn vec4(color, material.alpha);\n}\nvec4 czm_private_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)\n{\nfloat diffuse = czm_private_getLambertDiffuseOfMaterial(lightDirectionEC, material);\nfloat specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);\nvec3 ambient = vec3(0.0);\nvec3 color = ambient + material.emission;\ncolor += material.diffuse * diffuse * czm_lightColor;\ncolor += material.specular * specular * czm_lightColor;\nreturn vec4(color, material.alpha);\n}\n\nczm_material czm_getDefaultMaterial(czm_materialInput materialInput)\n{\nczm_material material;\nmaterial.diffuse = vec3(0.0);\nmaterial.specular = 0.0;\nmaterial.shininess = 1.0;\nmaterial.normal = materialInput.normalEC;\nmaterial.emission = vec3(0.0);\nmaterial.alpha = 1.0;\nreturn material;\n}\n\nvec3 czm_gammaCorrect(vec3 color) {\n#ifdef HDR\ncolor = pow(color, vec3(czm_gamma));\n#endif\nreturn color;\n}\nvec4 czm_gammaCorrect(vec4 color) {\n#ifdef HDR\ncolor.rgb = pow(color.rgb, vec3(czm_gamma));\n#endif\nreturn color;\n}\n\n#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)\nvarying float v_WindowZ;\n#endif\nvoid czm_writeDepthClamp()\n{\n#if defined(GL_EXT_frag_depth) && !defined(LOG_DEPTH)\ngl_FragDepthEXT = clamp(v_WindowZ * gl_FragCoord.w, 0.0, 1.0);\n#endif\n}\n\nfloat czm_planeDistance(vec4 plane, vec3 point) {\nreturn (dot(plane.xyz, point) + plane.w);\n}\nfloat czm_planeDistance(vec3 planeNormal, float planeDistance, vec3 point) {\nreturn (dot(planeNormal, point) + planeDistance);\n}\n\nconst float czm_twoPi = 6.283185307179586;\n\nvec2 czm_approximateSphericalCoordinates(vec3 normal) {\nfloat latitudeApproximation = czm_fastApproximateAtan(sqrt(normal.x * normal.x + normal.y * normal.y), normal.z);\nfloat longitudeApproximation = czm_fastApproximateAtan(normal.x, normal.y);\nreturn vec2(latitudeApproximation, longitudeApproximation);\n}\n\nuniform mat4 czm_inverseView;\nuniform sampler2D czm_globeDepthTexture;\nfloat czm_unpackDepth(vec4 packedDepth)\n{\nreturn dot(packedDepth, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));\n}\n\nvec4 czm_windowToEyeCoordinates(vec4 fragmentCoordinate)\n{\nfloat x = 2.0 * (fragmentCoordinate.x - czm_viewport.x) / czm_viewport.z - 1.0;\nfloat y = 2.0 * (fragmentCoordinate.y - czm_viewport.y) / czm_viewport.w - 1.0;\nfloat z = (fragmentCoordinate.z - czm_viewportTransformation[3][2]) / czm_viewportTransformation[2][2];\nvec4 q = vec4(x, y, z, 1.0);\nq /= fragmentCoordinate.w;\nif (!(czm_inverseProjection == mat4(0.0)))\n{\nq = czm_inverseProjection * q;\n}\nelse\n{\nfloat top = czm_frustumPlanes.x;\nfloat bottom = czm_frustumPlanes.y;\nfloat left = czm_frustumPlanes.z;\nfloat right = czm_frustumPlanes.w;\nfloat near = czm_currentFrustum.x;\nfloat far = czm_currentFrustum.y;\nq.x = (q.x * (right - left) + left + right) * 0.5;\nq.y = (q.y * (top - bottom) + bottom + top) * 0.5;\nq.z = (q.z * (near - far) - near - far) * 0.5;\nq.w = 1.0;\n}\nreturn q;\n}\nvec4 czm_windowToEyeCoordinates(vec2 fragmentCoordinateXY, float depthOrLogDepth)\n{\n#ifdef LOG_DEPTH\nfloat near = czm_currentFrustum.x;\nfloat far = czm_currentFrustum.y;\nfloat log2Depth = depthOrLogDepth * czm_log2FarDepthFromNearPlusOne;\nfloat depthFromNear = pow(2.0, log2Depth) - 1.0;\nfloat depthFromCamera = depthFromNear + near;\nvec4 windowCoord = vec4(fragmentCoordinateXY, far * (1.0 - near / depthFromCamera) / (far - near), 1.0);\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(windowCoord);\neyeCoordinate.w = 1.0 / depthFromCamera;\nreturn eyeCoordinate;\n#else\nvec4 windowCoord = vec4(fragmentCoordinateXY, depthOrLogDepth, 1.0);\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(windowCoord);\n#endif\nreturn eyeCoordinate;\n}\n\n\n\n#line 0\n\n#line 0\n\n#line 0\n#ifdef GL_EXT_frag_depth\n\n#endif\n#ifdef TEXTURE_COORDINATES\n#ifdef SPHERICAL\nvarying vec4 v_sphericalExtents;\n#else \nvarying vec2 v_inversePlaneExtents;\nvarying vec4 v_westPlane;\nvarying vec4 v_southPlane;\n#endif \nvarying vec3 v_uvMinAndSphericalLongitudeRotation;\nvarying vec3 v_uMaxAndInverseDistance;\nvarying vec3 v_vMaxAndInverseDistance;\n#endif \n#ifdef PER_INSTANCE_COLOR\nvarying vec4 v_color;\n#endif\n#ifdef NORMAL_EC\nvec3 getEyeCoordinate3FromWindowCoordinate(vec2 fragCoord, float logDepthOrDepth) {\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(fragCoord, logDepthOrDepth);\nreturn eyeCoordinate.xyz / eyeCoordinate.w;\n}\nvec3 vectorFromOffset(vec4 eyeCoordinate, vec2 positiveOffset) {\nvec2 glFragCoordXY = gl_FragCoord.xy;\nfloat upOrRightLogDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, (glFragCoordXY + positiveOffset) / czm_viewport.zw));\nfloat downOrLeftLogDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, (glFragCoordXY - positiveOffset) / czm_viewport.zw));\nbvec2 upOrRightInBounds = lessThan(glFragCoordXY + positiveOffset, czm_viewport.zw);\nfloat useUpOrRight = float(upOrRightLogDepth > 0.0 && upOrRightInBounds.x && upOrRightInBounds.y);\nfloat useDownOrLeft = float(useUpOrRight == 0.0);\nvec3 upOrRightEC = getEyeCoordinate3FromWindowCoordinate(glFragCoordXY + positiveOffset, upOrRightLogDepth);\nvec3 downOrLeftEC = getEyeCoordinate3FromWindowCoordinate(glFragCoordXY - positiveOffset, downOrLeftLogDepth);\nreturn (upOrRightEC - (eyeCoordinate.xyz / eyeCoordinate.w)) * useUpOrRight + ((eyeCoordinate.xyz / eyeCoordinate.w) - downOrLeftEC) * useDownOrLeft;\n}\n#endif \nvoid main(void)\n{\n#ifdef REQUIRES_EC\nfloat logDepthOrDepth = czm_unpackDepth(texture2D(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));\nvec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, logDepthOrDepth);
				// #endif\n#ifdef REQUIRES_WC\nvec4 worldCoordinate4 = czm_inverseView * eyeCoordinate;\nvec3 worldCoordinate = worldCoordinate4.xyz / worldCoordinate4.w;\n#endif\n#ifdef TEXTURE_COORDINATES\nvec2 uv;\n#ifdef SPHERICAL\nvec2 sphericalLatLong = czm_approximateSphericalCoordinates(worldCoordinate);\nsphericalLatLong.y += v_uvMinAndSphericalLongitudeRotation.z;\nsphericalLatLong.y = czm_branchFreeTernary(sphericalLatLong.y < czm_pi, sphericalLatLong.y, sphericalLatLong.y - czm_twoPi);\nuv.x = (sphericalLatLong.y - v_sphericalExtents.y) * v_sphericalExtents.w;\nuv.y = (sphericalLatLong.x - v_sphericalExtents.x) * v_sphericalExtents.z;\n#else \nuv.x = czm_planeDistance(v_westPlane, eyeCoordinate.xyz / eyeCoordinate.w) * v_inversePlaneExtents.x;\nuv.y = czm_planeDistance(v_southPlane, eyeCoordinate.xyz / eyeCoordinate.w) * v_inversePlaneExtents.y;\n#endif \n#endif \n#ifdef PICK\n#ifdef CULL_FRAGMENTS\nif (0.0 <= uv.x && uv.x <= 1.0 && 0.0 <= uv.y && uv.y <= 1.0 || logDepthOrDepth != 0.0) {\ngl_FragColor.a = 1.0;\nczm_writeDepthClamp();\n}\n#else \ngl_FragColor.a = 1.0;\n#endif \n#else \n#ifdef CULL_FRAGMENTS\nif (uv.x <= 0.0 || 1.0 <= uv.x || uv.y <= 0.0 || 1.0 <= uv.y || logDepthOrDepth == 0.0) {\ndiscard;\n}\n#endif\n#ifdef NORMAL_EC\nvec3 downUp = vectorFromOffset(eyeCoordinate, vec2(0.0, 1.0));\nvec3 leftRight = vectorFromOffset(eyeCoordinate, vec2(1.0, 0.0));\nvec3 normalEC = normalize(cross(leftRight, downUp));\n#endif\n#ifdef PER_INSTANCE_COLOR\nvec4 color = czm_gammaCorrect(v_color);\n#ifdef FLAT\ngl_FragColor = color;\n#else \nczm_materialInput materialInput;\nmaterialInput.normalEC = normalEC;\nmaterialInput.positionToEyeEC = -eyeCoordinate.xyz;\nczm_material material = czm_getDefaultMaterial(materialInput);\nmaterial.diffuse = color.rgb;\nmaterial.alpha = color.a;\ngl_FragColor = czm_phong(normalize(-eyeCoordinate.xyz), material, czm_lightDirectionEC);\n#endif \ngl_FragColor.rgb *= gl_FragColor.a;\n#else \nczm_materialInput materialInput;\n#ifdef USES_NORMAL_EC\nmaterialInput.normalEC = normalEC;\n#endif\n#ifdef USES_POSITION_TO_EYE_EC\nmaterialInput.positionToEyeEC = -eyeCoordinate.xyz;\n#endif\n#ifdef USES_TANGENT_TO_EYE\nmaterialInput.tangentToEyeMatrix = czm_eastNorthUpToEyeCoordinates(worldCoordinate, normalEC);\n#endif\n#ifdef USES_ST\nmaterialInput.st.x = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_uMaxAndInverseDistance.xy, uv) * v_uMaxAndInverseDistance.z;\nmaterialInput.st.y = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_vMaxAndInverseDistance.xy, uv) * v_vMaxAndInverseDistance.z;\n#endif\nczm_material material = czm_getMaterial(materialInput);\n#ifdef FLAT\ngl_FragColor = vec4(material.diffuse + material.emission, material.alpha);\n#else \ngl_FragColor = czm_phong(normalize(-eyeCoordinate.xyz), material, czm_lightDirectionEC);\n#endif \ngl_FragColor.rgb *= gl_FragColor.a;\n#endif \nczm_writeDepthClamp();\n#endif \n}\n
			
				attributeLocations: {
					positionHigh: 0,
					positionLow:  1,
				},
			} ),
		];


		// 创建渲染状态
		this.renderStates = [
			new Cesium.RenderState( {
				blending: { enabled: false },
				colorMask: { red: false, green: false, blue: false, alpha: false },
				cull: { enabled: false, face: 1029 },
				depthMask: false,
				depthRange: { near: 0, far: 1 },
				depthTest: {enabled: true, func: 515},
				frontFace: 2305,
				polygonOffset: { enabled: false, factor: 0, units: 0 },
				sampleCoverage: { enabled: false, value: 1, invert: false },
				scissorTest: { enabled: false },
				stencilMask: 15,
				stencilTest: {
					backFunction: 519,
					backOperation: { fail: 7680, zFail: 34055, zPass: 7680 },
					enabled: true,
					frontFunction: 519,
					frontOperation: { fail: 7680, zFail: 34056, zPass: 7680 },
					mask: 128,
					reference: 128,
				},
			} ),
			
			new Cesium.RenderState( {
				blending: { enabled: false },
				colorMask: { red: false, green: false, blue: false, alpha: false },
				cull: { enabled: false, face: 1029 },
				depthMask: false,
				depthRange: { near: 0, far: 1 },
				depthTest: { enabled: true, func: 515 },
				frontFace: 2305,
				polygonOffset: { enabled: false, factor: 0, units: 0 },
				sampleCoverage: { enabled: false, value: 1, invert: false },
				scissorTest: { enabled: false },
				stencilMask: 15,
				stencilTest: {
					backFunction: 514,
					backOperation: { fail: 7680, zFail: 34055, zPass: 7680 },
					enabled: true,
					frontFunction: 514,
					frontOperation: { fail: 7680, zFail: 34056, zPass: 7680 },
					mask: 128,
					reference: 128,
				},
			} ),
			
			new Cesium.RenderState( {
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
				scissorTest: {enabled: false },
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
			} ),
		];

		this.modelMatrix = Cesium.Matrix4.clone( Cesium.Matrix4.IDENTITY, new Cesium.Matrix4() );

		/**
		 * 为了维护方便，建议在这里对 drawCommand 进行分类
		 * 这里有两种想法，一种是分为 模板测试类 和 着色类
		 * 另一种方法是将其直接分为阴影体类，按照图层进行分类，建议用这种
		 */
		this.drawCommands = [
			new Cesium.DrawCommand( {
				owner: this,
				vertexArray: this.vertexArray,
				uniformMap: {
					visibleColor: () => this.visibleColor,
					invisibleColor: () => this.invisibleColor,
				},
				shaderProgram: this.shaderPrograms[ 0 ],
				primitiveType: Cesium.PrimitiveType.TRIANGLES,
				renderState: this.renderStates[ 0 ],
				pass: Cesium.Pass.TERRAIN_CLASSIFICATION,
				modelMatrix: this.modelMatrix,
				castShadows: false,
			} ),

			new Cesium.DrawCommand( {
				owner: this,
				vertexArray: this.vertexArray,
				uniformMap: {
					visibleColor: () => this.visibleColor,
					invisibleColor: () => this.invisibleColor,
				},
				shaderProgram: this.shaderPrograms[ 0 ],
				primitiveType: Cesium.PrimitiveType.TRIANGLES,
				renderState: this.renderStates[ 1 ],
				pass: Cesium.Pass.CESIUM_3D_TILE_CLASSIFICATION,
				modelMatrix: this.modelMatrix,
				castShadows: false,
			} ),
			new Cesium.DrawCommand( {
				owner: this,
				vertexArray: this.vertexArray,
				uniformMap: {
					visibleColor: () => this.visibleColor,
					invisibleColor: () => this.invisibleColor,
				},
				shaderProgram: this.shaderPrograms[ 1 ],
				primitiveType: Cesium.PrimitiveType.TRIANGLES,
				renderState: this.renderStates[ 2 ],
				pass: Cesium.Pass.TERRAIN_CLASSIFICATION,
				modelMatrix: this.modelMatrix,
				castShadows: false,
			} ),
			new Cesium.DrawCommand( {
				owner: this,
				vertexArray: this.vertexArray,
				uniformMap: {
					visibleColor: () => this.visibleColor,
					invisibleColor: () => this.invisibleColor,
				},
				shaderProgram: this.shaderPrograms[ 1 ],
				primitiveType: Cesium.PrimitiveType.TRIANGLES,
				renderState: this.renderStates[ 2 ],
				pass: Cesium.Pass.CESIUM_3D_TILE_CLASSIFICATION,
				modelMatrix: this.modelMatrix,
				castShadows: false,
			} ),
			// 建一个 GroundPrrmitive 再次测试
			
		];
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

	initDrawCommand() {

		const drawCommand = new Cesium.DrawCommand( {
			owner: this,
			vertexArray: this.vertexArray,
			uniformMap: {
				visibleColor: () => this.visibleColor,
				invisibleColor: () => this.invisibleColor,
			},
			shaderProgram: this.shaderPrograms[ 0 ],
			primitiveType: Cesium.PrimitiveType.TRIANGLES,
			renderState: this.renderStates[ 0 ],
			pass: Cesium.Pass.OPAQUE,
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
		for ( let i = 0, len = this.drawCommands.length; i < len; ++i ) {

			frameState.commandList.push( this.drawCommands[ i ] );
		}
	}
}

export default ShadowBodys;