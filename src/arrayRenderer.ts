

interface TriangleMesh {
    /** A list of X coordinates which are indexed in to by other arrays. Parallel with coordY / coordZ */
    coordX: number[];
    /** A list of Y coordinates which are indexed in to by other arrays. Parallel with coordX / coordZ */
    coordY: number[];
    /** A list of Z coordinates which are indexed in to by other arrays. Parallel with coordX / coordY */
    coordZ: number[];

    /** A list of coordinate indices for the first vertex in the triangles of the list. Parallel with triB / triC */
    triA: number[];
    /** A list of coordinate indices for the first vertex in the triangles of the list. Parallel with triA / triC */
    triB: number[];
    /** A list of coordinate indices for the first vertex in the triangles of the list. Parallel with triA / triB */
    triC: number[];

    /** A list of X values for the normalized surface vectors of the triangles. Parallel with the 'tri' arrays */
    normalsX: number[];
    /** A list of Y values for the normalized surface vectors of the triangles. Parallel with the 'tri' arrays */
    normalsY: number[];
    /** A list of Z values for the normalized surface vectors of the triangles. Parallel with the 'tri' arrays */
    normalsZ: number[];

    /** A list of vertex indices of the mesh's edge starting points. Parallel with edgeEnds */
    edgeStarts: number[];
    /** A list of vertex indices of the mesh's edge ending points. Parallel with edgeStarts */
    edgeEnds: number[];

    /** A list of normal indices for each edge's 'left' normal. Parallel with edgeStarts/edgeEnds, indexes into normalsX/Y/Z */
    edgeLeftNormals: number[];
    /** A list of normal indices for each edge's 'right' normal. Parallel with edgeStarts/edgeEnds, indexes into normalsX/Y/Z */
    edgeRightNormals: number[];
}

module Rendering {
    export interface TriangleRenderResult {
        depthBuffer: Float64Array;
        triangleBuffer: Int32Array;
        imageData: ImageData;
        camera: Geometry.CameraAndScale;
        size: Geometry.ImageSize;
        mesh: TriangleMesh;
    }

    export function renderTriangles(ctx: CanvasRenderingContext2D, triMesh: TriangleMesh, size: Geometry.ImageSize, cameraAndScale: Geometry.CameraAndScale): TriangleRenderResult {
        var width = size.width, height = size.height, camera = cameraAndScale.camera, cameraScale = cameraAndScale.scale;

        var imageData = ctx.getImageData(0, 0, width, height);
        var forward = Geometry.getForwardVector(camera);
        var forward_x = forward.x;
        var forward_y = forward.y;
        var forward_z = forward.z;
        var left_x = camera.xx, left_y = camera.yx, left_z = camera.zx;
        var up_x = camera.xy, up_y = camera.yy, up_z = camera.zy;

        var triangleBuffer = new ArrayBuffer(imageData.data.length);
        var triangleBufferView = new Int32Array(triangleBuffer, 0);
        var depthBuffer = new ArrayBuffer(imageData.data.length * 2);
        var depthBufferView = new Float64Array(depthBuffer, 0);
        for (var i = 0; i < depthBufferView.length; i++) {
            depthBufferView[i] = -Infinity;
            triangleBuffer[i] = -1;
        }

        var imgData = imageData.data;

        for (var i = 0; i < triMesh.triA.length; i++) {
            var cameraDotNormal = triMesh.normalsX[i] * forward_x + triMesh.normalsY[i] * forward_y + triMesh.normalsZ[i] * forward_z;
            if (cameraDotNormal > 0) {
                var cameraLeftNormal = triMesh.normalsX[i] * left_x + triMesh.normalsY[i] * left_y + triMesh.normalsZ[i] * left_z;
                var cameraUpNormal = triMesh.normalsX[i] * up_x + triMesh.normalsY[i] * up_y + triMesh.normalsZ[i] * up_z;

                // Vertex indices for each vertex of the triangle
                var ai = triMesh.triA[i], bi = triMesh.triB[i], ci = triMesh.triC[i];
                // World coordinates of each triangle vertex
                var worldX1 = triMesh.coordX[ai], worldY1 = triMesh.coordY[ai], worldZ1 = triMesh.coordZ[ai];
                var worldX2 = triMesh.coordX[bi], worldY2 = triMesh.coordY[bi], worldZ2 = triMesh.coordZ[bi];
                var worldX3 = triMesh.coordX[ci], worldY3 = triMesh.coordY[ci], worldZ3 = triMesh.coordZ[ci];

                // Unrounded pixel coordinates of each triangle vertex
                var x1 = (worldX1 * camera.xx + worldY1 * camera.yx + worldZ1 * camera.zx) * cameraScale.scale - cameraScale.xOffset;
                var y1 = (worldX1 * camera.xy + worldY1 * camera.yy + worldZ1 * camera.zy) * cameraScale.scale - cameraScale.yOffset;
                var x2 = (worldX2 * camera.xx + worldY2 * camera.yx + worldZ2 * camera.zx) * cameraScale.scale - cameraScale.xOffset;
                var y2 = (worldX2 * camera.xy + worldY2 * camera.yy + worldZ2 * camera.zy) * cameraScale.scale - cameraScale.yOffset;
                var x3 = (worldX3 * camera.xx + worldY3 * camera.yx + worldZ3 * camera.zx) * cameraScale.scale - cameraScale.xOffset;
                var y3 = (worldX3 * camera.xy + worldY3 * camera.yy + worldZ3 * camera.zy) * cameraScale.scale - cameraScale.yOffset;

                // Fixed-point versions of coordinates
                var fx1 = (x1 * 16 + 0.5) | 0, fx2 = (x2 * 16 + 0.5) | 0, fx3 = (x3 * 16 + 0.5) | 0;
                var fy1 = (y1 * 16 + 0.5) | 0, fy2 = (y2 * 16 + 0.5) | 0, fy3 = (y3 * 16 + 0.5) | 0;

                // Delta values (fixed-point)
                var dx12 = fx1 - fx2, dx23 = fx2 - fx3, dx31 = fx3 - fx1;
                var dy12 = fy1 - fy2, dy23 = fy2 - fy3, dy31 = fy3 - fy1;
                // Higher-order delta values
                var fdx12 = dx12 << 4, fdx23 = dx23 << 4, fdx31 = dx31 << 4;
                var fdy12 = dy12 << 4, fdy23 = dy23 << 4, fdy31 = dy31 << 4;

                // Bounding rectangle (rounded pixel coordinates)
                var xMin = (Math.min(fx1, fx2, fx3) + 0xF) >> 4;
                var yMin = (Math.min(fy1, fy2, fy3) + 0xF) >> 4;
                var xMax = (Math.max(fx1, fx2, fx3) + 0xF) >> 4;
                var yMax = (Math.max(fy1, fy2, fy3) + 0xF) >> 4;

                // Fixed-point bounding rectangle
                var fxMin = xMin << 4, fyMin = yMin << 4;
                var fxMax = xMax << 4, fyMax = yMax << 4;

                // Half-space constants
                var c1 = dy12 * fx1 - dx12 * fy1;
                var c2 = dy23 * fx2 - dx23 * fy2;
                var c3 = dy31 * fx3 - dx31 * fy3;

                // Corrected fill convention
                if (dy12 < 0 || (dy12 === 0 && dx12 > 0)) c1++;
                if (dy23 < 0 || (dy23 === 0 && dx23 > 0)) c2++;
                if (dy31 < 0 || (dy31 === 0 && dx31 > 0)) c3++;

                // Cached computation of partials of half edge equations
                var cy1 = c1 + dx12 * fyMin - dy12 * fxMin;
                var cy2 = c2 + dx23 * fyMin - dy23 * fxMin;
                var cy3 = c3 + dx31 * fyMin - dy31 * fxMin;

                // Depth values
                var depth1 = worldX1 * forward_x + worldY1 * forward_y + worldZ1 * forward_z;
                var depth2 = worldX2 * forward_x + worldY2 * forward_y + worldZ2 * forward_z;
                var depth3 = worldX3 * forward_x + worldY3 * forward_y + worldZ3 * forward_z;

                // Bilinear depth interpolation constants
                // DET = determinant of the original matrix = 
                // x1 * y2 - x2 * y1 + x2 * y3 - x3 * y2 + x3 * y1 - x1 * y3
                var bl_det = x1 * y2 - x2 * y1 + x2 * y3 - x3 * y2 + x3 * y1 - x1 * y3;
                // A = ((y2 - y3) * w1 + (y3 - y1) * w2 + (y1 - y2) * w3) / DET
                var bl_a = ((y2 - y3) * depth1 + (y3 - y1) * depth2 + (y1 - y2) * depth3) / bl_det;
                // B = ((x3 - x2) * w1 + (x1 - x3) * w2 + (x2 - x1) * w3) / DET
                var bl_b = ((x3 - x2) * depth1 + (x1 - x3) * depth2 + (x2 - x1) * depth3) / bl_det;
                // C = ((x2 * y3 - x3 * y2) * w1 + (x3 * y1 - x1 * y3) * w2 + (x1 * y2 - x2 * y1) * w3) / DET
                var bl_c = ((x2 * y3 - x3 * y2) * depth1 + (x3 * y1 - x1 * y3) * depth2 + (x1 * y2 - x2 * y1) * depth3) / bl_det;

                var pScanline = yMin * width * 4;
                // Non-iterative calculation: depth = bl_a * (ix) + bl_b * (y + iy) + bl_c
                var depth_base = xMin * bl_a + yMin * bl_b + bl_c;
                for (var y = yMin; y < yMax; y++) {
                    var cx1 = cy1, cx2 = cy2, cx3 = cy3;

                    var pOutput = pScanline + xMin * 4;
                    var currentDepth = depth_base;
                    for (var x = xMin; x < xMax; x++) {
                        if (cx1 > 0 && cx2 > 0 && cx3 > 0) {
                            if (depthBufferView[pOutput >> 2] < currentDepth) {
                                depthBufferView[pOutput >> 2] = currentDepth;
                                triangleBufferView[pOutput >> 2] = i;

                                var grey = (256 * cameraDotNormal) >> 1;
                                imgData[pOutput] = grey + (256 * cameraDotNormal) >> 1;
                                imgData[pOutput + 1] = grey + (160 * (1 - cameraUpNormal)) >> 1;
                                imgData[pOutput + 2] = grey + (256 * cameraLeftNormal) >> 1;
                                // imgData[pOutput + 2] = 128;
                                imgData[pOutput + 3] = 0xFF;
                            }
                        }
                        pOutput += 4;

                        cx1 -= fdy12;
                        cx2 -= fdy23;
                        cx3 -= fdy31;
                        currentDepth += bl_a;
                    }

                    cy1 += fdx12;
                    cy2 += fdx23;
                    cy3 += fdx31;
                    pScanline += width * 4;
                    depth_base += bl_b;
                }
            }
        }

        return {
            depthBuffer: depthBufferView,
            imageData: imageData,
            triangleBuffer: triangleBufferView,
            camera: cameraAndScale,
            mesh: triMesh,
            size: size
        };
    }

    export function renderOutlining(ctx: CanvasRenderingContext2D, triangleRendering: TriangleRenderResult) {
        var width = triangleRendering.size.width, height = triangleRendering.size.height, triMesh = triangleRendering.mesh;
        var camera = triangleRendering.camera.camera, cameraScale = triangleRendering.camera.scale;
        var depthBuffer = triangleRendering.depthBuffer, triBuffer = triangleRendering.triangleBuffer;
        var forward = Geometry.getForwardVector(camera);

        var imageData = ctx.createImageData(width, height);
        var imgData = imageData.data;
        for (var i = 0; i < triMesh.edgeStarts.length; i++) {
            var startCoordIndex = triMesh.edgeStarts[i];
            var endCoordIndex = triMesh.edgeEnds[i];
            var leftNormalIndex = triMesh.edgeLeftNormals[i];
            var rightNormalIndex = triMesh.edgeRightNormals[i];

            function cameraDotProduct(normalIndex: number) {
                return triMesh.normalsX[normalIndex] * forward.x + triMesh.normalsY[normalIndex] * forward.y + triMesh.normalsZ[normalIndex] * forward.z;
            }

            var startSign = cameraDotProduct(triMesh.edgeLeftNormals[i]);
            var endSign = cameraDotProduct(triMesh.edgeRightNormals[i]);

            // Skip fully-back edges
            // if (startSign < -0.05 && endSign < -0.05) continue;
            var shouldRenderHardEdge = (startSign <= 0) !== (endSign <= 0);
            var softDot = triMesh.normalsX[leftNormalIndex] * triMesh.normalsX[rightNormalIndex] + triMesh.normalsY[leftNormalIndex] * triMesh.normalsY[rightNormalIndex] + triMesh.normalsZ[leftNormalIndex] * triMesh.normalsZ[rightNormalIndex];
            var shouldRenderSoftEdge = softDot < 0.4;

            if (shouldRenderHardEdge || shouldRenderSoftEdge) {
                var sx = triMesh.coordX[startCoordIndex], sy = triMesh.coordY[startCoordIndex], sz = triMesh.coordZ[startCoordIndex];
                var ex = triMesh.coordX[endCoordIndex], ey = triMesh.coordY[endCoordIndex], ez = triMesh.coordZ[endCoordIndex];
                var psx = (sx * camera.xx + sy * camera.yx + sz * camera.zx) * cameraScale.scale - cameraScale.xOffset;
                var psy = (sx * camera.xy + sy * camera.yy + sz * camera.zy) * cameraScale.scale - cameraScale.yOffset;
                var pex = (ex * camera.xx + ey * camera.yx + ez * camera.zx) * cameraScale.scale - cameraScale.xOffset;
                var pey = (ex * camera.xy + ey * camera.yy + ez * camera.zy) * cameraScale.scale - cameraScale.yOffset;
                var ds = sx * forward.x + sy * forward.y + sz * forward.z;
                var de = ex * forward.x + ey * forward.y + ez * forward.z;
                // Used for swapping
                var tmp: number;

                var spanX = Math.abs(pex - psx);
                var spanY = Math.abs(pey - psy);

                var r = Math.random() * 512 >> 1;
                var g = Math.random() * 512 >> 1;
                var b = Math.random() * 512 >> 1;

                var ignoreDepthCulling = false;
                var depthFudge = 0.0001;
                if (spanX >= spanY) {
                    // x-iterating Bresenham's algorithm
                    // Normalize so that start x < end x
                    if (psx > pex) {
                        tmp = psx; psx = pex; pex = tmp;
                        tmp = psy; psy = pey; pey = tmp;
                        tmp = ds; ds = de; de = tmp;
                    }
                    var currentDepth = ds;
                    var depthChange = (de - ds) / (pex - psx);
                    var outputPtr = (((psx + 0.5) | 0) + ((psy + 0.5) | 0) * width) * 4;
                    var deltaY = (pey - psy) / (pex - psx);
                    var yError = 0;
                    var y = psy;
                    for (var x = psx; x <= pex; x++) {
                        var red = 0, green = 0, blue = 0;
                        var actualDepth = Math.min(
                            depthBuffer[(outputPtr) >> 2],
                            depthBuffer[(outputPtr + width * 4) >> 2],
                            depthBuffer[(outputPtr + 4) >> 2],
                            depthBuffer[(outputPtr - width * 4) >> 2],
                            depthBuffer[(outputPtr - 4) >> 2]);

                        var isVisible = actualDepth <= (currentDepth + depthFudge);
                        // An edge cannot be occluded by one of its constituent triangles
                        if (!isVisible) {
                            if ((triBuffer[outputPtr >> 2] === triMesh.edgeLeftNormals[i]) || (triBuffer[outputPtr >> 2] === triMesh.edgeRightNormals[i])) {
                                isVisible = true;
                            }
                        }

                        if (isVisible || (ignoreDepthCulling && imgData[outputPtr + 3] === 0)) {
                            imgData[outputPtr + 0] = isVisible ? red : 255;
                            imgData[outputPtr + 1] = isVisible ? green : 128; // shouldRenderHardEdge ? 200 : 0;
                            imgData[outputPtr + 2] = isVisible ? blue : 128; // shouldRenderSoftEdge ? 255 : 0;
                            imgData[outputPtr + 3] = 255;
                        }
                        currentDepth += depthChange;
                        yError += deltaY;
                        if (yError > 0.5) {
                            yError -= 1;
                            y++;
                            outputPtr += width * 4;
                        } else if (yError < -0.5) {
                            yError += 1;
                            y--;
                            outputPtr -= width * 4;
                        }
                        outputPtr += 4;
                    }
                } else {
                    // y-iterating Bresenham's algorithm
                    // Normalize so that start y < end y
                    if (psy > pey) {
                        tmp = psx; psx = pex; pex = tmp;
                        tmp = psy; psy = pey; pey = tmp;
                        tmp = ds; ds = de; de = tmp;
                    }
                    var currentDepth = ds;
                    var depthChange = (de - ds) / (pey - psy);
                    var outputPtr = (((psx + 0.5) | 0) + ((psy + 0.5) | 0) * width) * 4;
                    var deltaX = (pex - psx) / (pey - psy);
                    var xError = 0;
                    var x = psx;
                    for (var y = psy; y <= pey; y++) {
                        var actualDepth = Math.min(
                            depthBuffer[(outputPtr) >> 2],
                            depthBuffer[(outputPtr + width * 4) >> 2],
                            depthBuffer[(outputPtr + 4) >> 2],
                            depthBuffer[(outputPtr - width * 4) >> 2],
                            depthBuffer[(outputPtr - 4) >> 2]);
                        var isVisible = actualDepth <= (currentDepth + depthFudge);
                        // An edge cannot be occluded by one of its constituent triangles
                        if (!isVisible) {
                            if ((triBuffer[outputPtr >> 2] === triMesh.edgeLeftNormals[i]) || (triBuffer[outputPtr >> 2] === triMesh.edgeRightNormals[i])) {
                                isVisible = true;
                            }
                        }
                        if (isVisible || (ignoreDepthCulling && imgData[outputPtr + 3] === 0)) {
                            imgData[outputPtr + 0] = isVisible ? red : 128;
                            imgData[outputPtr + 1] = isVisible ? green : 255; // shouldRenderHardEdge ? 200 : 0;
                            imgData[outputPtr + 2] = isVisible ? blue : 128; // shouldRenderSoftEdge ? 255 : 0;
                            imgData[outputPtr + 3] = 255;
                        }

                        currentDepth += depthChange;
                        xError += deltaX;
                        if (xError > 0.5) {
                            xError -= 1;
                            x++;
                            outputPtr += 4;
                        } else if (xError < -0.5) {
                            xError += 1;
                            x--;
                            outputPtr -= 4;
                        }
                        outputPtr += width * 4;
                    }

                }
            }
        }
        return imageData;
    }

    export module Diagnostics {
        export function renderTriangles(ctx: CanvasRenderingContext2D, render: TriangleRenderResult) {
            var width = render.size.width, height = render.size.height;
            var triBuffer = render.triangleBuffer;

            var imageData = ctx.createImageData(width, height);

            var lookupR: any = {};
            var lookupG: any = {};
            var lookupB: any = {};
            var p = 0;
            for (var y = 0; y < height; y++) {
                for (var x = 0; x < width; x++) {
                    var t = triBuffer[p];
                    if (lookupR[t] === undefined) {
                        lookupR[t] = 128 + ((Math.random() * 128) | 0);
                        lookupG[t] = 128 + ((Math.random() * 128) | 0);
                        lookupB[t] = 128 + ((Math.random() * 128) | 0);
                    }
                    imageData.data[(p << 2) + 0] = lookupR[t];
                    imageData.data[(p << 2) + 1] = lookupG[t];
                    imageData.data[(p << 2) + 2] = lookupB[t];
                    imageData.data[(p << 2) + 3] = 255;
                    p++;
                }
            }

            return imageData;
        }

        export function renderDepthBuffer(ctx: CanvasRenderingContext2D, render: TriangleRenderResult) {
            var width = render.size.width, height = render.size.height;
            var depthBuffer = render.depthBuffer;

            var imageData = ctx.createImageData(width, height);

            var minDepth = Infinity;
            var maxDepth = -Infinity;
            var p = 0;
            for (var y = 0; y < height; y++) {
                for (var x = 0; x < width; x++) {
                    if (depthBuffer[p] !== -Infinity) {
                        minDepth = Math.min(minDepth, depthBuffer[p]);
                        maxDepth = Math.max(maxDepth, depthBuffer[p]);
                    }
                    p++;
                }
            }

            p = 0;
            for (var y = 0; y < height; y++) {
                for (var x = 0; x < width; x++) {
                    var d = ((depthBuffer[p] - minDepth) * 128 / (maxDepth - minDepth)) | 0;
                    // console.log(d);
                    if (depthBuffer[p] === -Infinity) {
                        imageData.data[(p << 2) + 3] = 0;
                    } else {
                        imageData.data[(p << 2) + 0] = d;
                        imageData.data[(p << 2) + 1] = d;
                        imageData.data[(p << 2) + 2] = d;
                        imageData.data[(p << 2) + 3] = 255;
                    }
                    p++;
                }
            }

            return imageData;
        }

        export function renderTrianglesToCanvas(ctx: CanvasRenderingContext2D, triMesh: TriangleMesh, size: Geometry.ImageSize, cameraAndScale: Geometry.CameraAndScale) {
            var camera = cameraAndScale.camera, cameraScale = cameraAndScale.scale;

            var forward = Geometry.getForwardVector(camera);
            function cameraDotProduct(normalIndex: number) {
                return triMesh.normalsX[normalIndex] * forward.x + triMesh.normalsY[normalIndex] * forward.y + triMesh.normalsZ[normalIndex] * forward.z;
            }

            for (var i = 0; i < triMesh.triA.length; i++) {
                var ds = cameraDotProduct(i);
                if (ds > 0) {
                    ds = (ds * 420) >> 1;
                    ctx.fillStyle = 'rgba(' + ds + ',' + ds + ',' + ds + ', 255)';

                    function moveTo(coordIndex: number) {
                        var sx = triMesh.coordX[coordIndex], sy = triMesh.coordY[coordIndex], sz = triMesh.coordZ[coordIndex];
                        var psx = sx * camera.xx + sy * camera.yx + sz * camera.zx;
                        var psy = sx * camera.xy + sy * camera.yy + sz * camera.zy;
                        psx = psx * cameraScale.scale - cameraScale.xOffset;
                        psy = psy * cameraScale.scale - cameraScale.yOffset;
                        ctx.moveTo(psx, psy);
                    }
                    function lineTo(coordIndex: number) {
                        var sx = triMesh.coordX[coordIndex], sy = triMesh.coordY[coordIndex], sz = triMesh.coordZ[coordIndex];
                        var psx = sx * camera.xx + sy * camera.yx + sz * camera.zx;
                        var psy = sx * camera.xy + sy * camera.yy + sz * camera.zy;
                        psx = psx * cameraScale.scale - cameraScale.xOffset;
                        psy = psy * cameraScale.scale - cameraScale.yOffset;
                        ctx.lineTo(psx, psy);
                    }

                    ctx.beginPath();
                    moveTo(triMesh.triA[i]);
                    lineTo(triMesh.triB[i]);
                    lineTo(triMesh.triC[i]);
                    lineTo(triMesh.triA[i]);
                    ctx.fill();
                }
            }
        }

        export function renderEdgesToCanvas(ctx: CanvasRenderingContext2D, renderResult: TriangleRenderResult) {
            var camera = renderResult.camera.camera;
            var scale = renderResult.camera.scale;
            var triMesh = renderResult.mesh;
            var forward = Geometry.getForwardVector(camera);

            ctx.strokeStyle = 'rgba(0,0,0,255)';
            for (var i = 0; i < triMesh.edgeStarts.length; i++) {
                var startCoordIndex = triMesh.edgeStarts[i];
                var endCoordIndex = triMesh.edgeEnds[i];
                var leftNormalIndex = triMesh.edgeLeftNormals[i];
                var rightNormalIndex = triMesh.edgeRightNormals[i];

                function cameraDotProduct(normalIndex: number) {
                    return triMesh.normalsX[normalIndex] * forward.x + triMesh.normalsY[normalIndex] * forward.y + triMesh.normalsZ[normalIndex] * forward.z;
                }

                var startSign = cameraDotProduct(triMesh.edgeLeftNormals[i]);
                var endSign = cameraDotProduct(triMesh.edgeRightNormals[i]);

                // Skip fully-back edges
                // if (startSign < 0 && endSign < 0) continue;

                var psx: number, psy: number, pex: number, pey: number;

                var shouldRenderHardEdge = (startSign < 0) !== (endSign < 0);
                var softDot = triMesh.normalsX[leftNormalIndex] * triMesh.normalsX[rightNormalIndex] + triMesh.normalsY[leftNormalIndex] * triMesh.normalsY[rightNormalIndex] + triMesh.normalsZ[leftNormalIndex] * triMesh.normalsZ[rightNormalIndex];
                var shouldRenderSoftEdge = Math.abs(softDot) < 0.2;

                if (shouldRenderHardEdge || shouldRenderSoftEdge) {
                    var sx = triMesh.coordX[startCoordIndex], sy = triMesh.coordY[startCoordIndex], sz = triMesh.coordZ[startCoordIndex];
                    var ex = triMesh.coordX[endCoordIndex], ey = triMesh.coordY[endCoordIndex], ez = triMesh.coordZ[endCoordIndex];
                    var psx = sx * camera.xx + sy * camera.yx + sz * camera.zx;
                    var psy = sx * camera.xy + sy * camera.yy + sz * camera.zy;
                    var pex = ex * camera.xx + ey * camera.yx + ez * camera.zx;
                    var pey = ex * camera.xy + ey * camera.yy + ez * camera.zy;
                    psx = psx * scale.scale - scale.xOffset;
                    psy = psy * scale.scale - scale.yOffset;
                    pex = pex * scale.scale - scale.xOffset;
                    pey = pey * scale.scale - scale.yOffset;
                }

                if (shouldRenderHardEdge) {
                    ctx.strokeStyle = 'rgba(0,0,0,255)';
                    // Boundary edges (transitions to/from back-facing to front-facing triangles)
                    ctx.beginPath();
                    ctx.moveTo(psx, psy);
                    ctx.lineTo(pex, pey);
                    ctx.stroke();
                } else if (shouldRenderSoftEdge) {
                    ctx.strokeStyle = 'rgba(0,128,0,255)';
                    ctx.beginPath();
                    ctx.moveTo(psx, psy);
                    ctx.lineTo(pex, pey);
                    ctx.stroke();
                }
            }

        }
    }
}
