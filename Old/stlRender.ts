/// <reference path="Scripts\threemodule.d.ts" />
/// <reference path="stlParsing.ts" />

interface CameraRenderOutput {
    /// Image showing the shaded view of the object in this camera
    basic: ImageData;
    /// Image showing an outline of the object in this camera
    outlined: ImageData;
    /// Image showing a grid
    grid: ImageData;
    /// A parallel array to the images indicating the depth from the frontmost edge of the object
    depth: Float64Array;
    /// A parallel array to the images mapping pixel coordinates to the triangles they collided with
    triangleIndex: Int32Array;
    /// Indicates the spacing, in world units, between major grid lines
    gridSpacing: number;
    /// The camera used to render the images
    camera: SimpleOrthographicCamera;
}


enum View {
    Top, Bottom, // -Z, +Z
    Left, Right, // -X, +X
    Front, Back // -Y, +Y
}

class OrthoCameraSet {
    public cameras: SimpleOrthographicCamera[] = [];
    public pixelsPerWorldUnit: number;

    constructor(extents: THREE.Vector3[], public drawWidth: number, public drawHeight: number) {
        var padding = 0.45;
        // Calculate the actual size of the object
        var size = extents[1].clone().sub(extents[0]);
        // Expand the apparent size of the object by the padding factor
        var expandedSize = size.clone().multiplyScalar(1 + padding);

        var objectCenter = extents[0].clone().add(extents[1]).multiplyScalar(0.5);

        // Calculate the scale of the object in pixels per world unit
        // Possible mappings for standard views are
        //   x = x, y = z (front)
        //   x = x, y = y (top)
        //   x = y, y = z (side)
        var scale = Math.min(drawWidth / Math.max(expandedSize.x, expandedSize.y), drawHeight / Math.max(expandedSize.y, expandedSize.z));
        this.pixelsPerWorldUnit = scale;

        var cameraWidth = drawWidth / scale;
        var cameraHeight = drawHeight / scale;

        function makeCameraExtents(xSize: number, ySize: number, zSize: number) {
            var origin = objectCenter.clone().sub(new THREE.Vector3(xSize, ySize, zSize).multiplyScalar(0.5));
            var maxima = origin.clone().add(expandedSize);
            if (xSize === undefined) {
                origin.x = extents[0].x;
                maxima.x = extents[1].x;
            }
            if (ySize === undefined) {
                origin.y = extents[0].y;
                maxima.y = extents[1].y;
            }
            if (zSize === undefined) {
                origin.z = extents[0].z;
                maxima.z = extents[1].z;
            }
            return [origin, maxima];
        }

        this.cameras[View.Top] = new SimpleOrthographicCamera(
            scale,
            scale, 0, 0, scale, 0, 0,
            0, 0, -1,
            makeCameraExtents(cameraWidth, cameraHeight, undefined));

        this.cameras[View.Front] = new SimpleOrthographicCamera(
            scale,
            scale, 0, 0, 0, 0, scale,
            0, 1, 0,
            makeCameraExtents(cameraWidth, undefined, cameraHeight));

        this.cameras[View.Left] = new SimpleOrthographicCamera(
            scale,
            0, 0, scale, 0, 0, scale,
            -1, 0, 0,
            makeCameraExtents(undefined, cameraWidth, cameraHeight));
    }
}

class SimpleOrthographicCamera {
    constructor(
        /** Scale factor in pixels per world unit */
        public scale: number,
        /** Vector contribution of changes in world x to change in camera y (including scale factor) */
        private xx: number, private xy: number,
        private yx: number, private yy: number,
        private zx: number, private zy: number,
        /** Direction of camera rays */
        private xd: number, private yd: number, private zd: number,
        private extents: THREE.Vector3[]) {
    }

    public worldToFilm(v: { x: number; y: number; z: number }): { x: number; y: number; } {
        var vx = v.x - this.extents[0].x;
        var vy = v.y - this.extents[0].y;
        var vz = v.z - this.extents[0].z;
        return {
            x: (vx * this.xx) + (vy * this.yx) + (vz * this.zx),
            y: (vx * this.xy) + (vy * this.yy) + (vz * this.zy)
        }
    }

    public depthOf(v: THREE.Vector3): number {
        var vx = v.x - this.extents[0].x;
        var vy = v.y - this.extents[0].y;
        var vz = v.z - this.extents[0].z;
        return vx * this.xd + vy * this.yd + vz * this.zd;
    }

    public filmToWorld(p: { x: number; y: number; }): THREE.Ray {
        var vx: number = 0, vy: number = 0, vz: number = 0;
        if (this.xx !== 0) vx += p.x / this.xx;
        if (this.xy !== 0) vx += p.y / this.xy;
        if (this.yx !== 0) vy += p.x / this.yx;
        if (this.yy !== 0) vy += p.y / this.yy;
        if (this.zx !== 0) vz += p.x / this.zx;
        if (this.zy !== 0) vz += p.y / this.zy;
        vx += this.extents[0].x;
        vy += this.extents[0].y;
        vz += this.extents[0].z;
        // if (this.xd !== 0) vx = NaN;
        // if (this.yd !== 0) vy = NaN;
        // if (this.zd !== 0) vz = NaN;
        var result = new THREE.Vector3();
        result.set(vx, vy, vz);
        return new THREE.Ray(
            result,
            new THREE.Vector3(this.xd, this.yd, this.zd));
    }
}


function renderOutline(depthBuffer: Float64Array, width: number, height: number, output: ImageData): void {
    var outlinedDepth = output.data;

    for (var x = 0; x < width; x++) {
        var prev = +Infinity;
        var delta = 0;
        for (var y = 0; y < height; y++) {
            var i = (y * width + x) << 2;
            var di = i >> 2;
            var diff = Math.min(
                Math.abs(prev - depthBuffer[di] - delta),
                Math.abs(prev - depthBuffer[di] - delta * 1.1),
                Math.abs(prev - depthBuffer[di]));

            var d = 1 - Math.min(diff, 1);
            if (d < 0.9) {
                outlinedDepth[i + 0] = d * 128;
                outlinedDepth[i + 1] = d * 128;
                outlinedDepth[i + 2] = d * 128;
                outlinedDepth[i + 3] = 255;
            } else if (depthBuffer[di] !== Infinity) {
                // Note: Don't copy this part into the Y-diff block!
                outlinedDepth[i + 0] = 255;
                outlinedDepth[i + 1] = 255;
                outlinedDepth[i + 2] = 255;
                outlinedDepth[i + 3] = 96;
            }

            delta = (prev - depthBuffer[di]);
            if (delta !== delta) delta = 0; // Infinity - Infinity case
            prev = depthBuffer[di];
        }
    }

    for (var y = 0; y < height; y++) {
        var prev = +Infinity;
        var delta = 0;
        for (var x = 0; x < width; x++) {
            var i = (y * width + x) << 2;
            var di = i >> 2;
            var diff = Math.min(
                Math.abs(prev - depthBuffer[di] - delta),
                Math.abs(prev - depthBuffer[di] - delta * 1.1),
                Math.abs(prev - depthBuffer[di] - delta / 1.1),
                Math.abs(prev - depthBuffer[di]));

            var d = 1 - Math.min(diff, 1);
            if (d < 0.9) {
                outlinedDepth[i + 0] = Math.min(d * 128, outlinedDepth[i + 0]);
                outlinedDepth[i + 1] = Math.min(d * 128, outlinedDepth[i + 1]);
                outlinedDepth[i + 2] = Math.min(d * 128, outlinedDepth[i + 2]);
                outlinedDepth[i + 3] = 255;
            }

            delta = (prev - depthBuffer[di]);
            if (delta !== delta) delta = 0; // Infinity - Infinity case
            prev = depthBuffer[di];
        }
    }
}

function renderGrid(origin: { x: number; y: number }, pixelsPerWorldUnit: number, width: number, height: number, output: ImageData): number {
    var gridData = output.data;

    // We want a grid spacing that is a power of 10 (or power of 10 divided by 2) that gives
    // a minimum pixel spacing
    var minimumPixelSpacing = 16;

    // Minimum number of world units per gridline
    var minimumWorldUnitSpacing = Math.ceil(minimumPixelSpacing / pixelsPerWorldUnit);
    // Round this up to the nearest power of 10
    var actualWorldUnitSpacing = Math.pow(10, Math.ceil(Math.log(minimumWorldUnitSpacing) / Math.LN10));
    // If this works at 5-scale, use that instead
    if (actualWorldUnitSpacing * pixelsPerWorldUnit / 2 >= minimumPixelSpacing) {
        actualWorldUnitSpacing = actualWorldUnitSpacing / 2;
    }
    var pixelSpacing = actualWorldUnitSpacing * pixelsPerWorldUnit;

    var startX = origin.x;
    var startY = origin.y;
    while (startX > pixelSpacing) startX -= pixelSpacing;
    while (startX < -pixelSpacing) startX += pixelSpacing;
    while (startY > pixelSpacing) startY -= pixelSpacing;
    while (startY < -pixelSpacing) startY += pixelSpacing;

    var xAxis = (origin.x) | 0;
    var yAxis = (origin.y) | 0;

    var darkLine = 48;
    var lightLine = 180;
    var blueness = 24;

    // X lines
    for (var x = startX; x < width; x += pixelSpacing) {
        var t = (x | 0) === xAxis ? darkLine : lightLine;
        for (var y = 0; y < height; y++) {
            var i = (y * width + (x | 0)) << 2;
            gridData[i + 0] = t;
            gridData[i + 1] = t;
            gridData[i + 2] = t + blueness;
            gridData[i + 3] = 255;
        }
    }
    // Y lines
    for (var y = startY; y < height; y += pixelSpacing) {
        var t = (y | 0) === yAxis ? darkLine : lightLine;
        for (var x = 0; x < width; x++) {
            var i = ((height - (y | 0) + 1) * width + x) << 2;
            if (gridData[i + 0] !== darkLine) {
                gridData[i + 0] = t;
                gridData[i + 1] = t;
                gridData[i + 2] = t + blueness;
                gridData[i + 3] = 255;
            }
        }
    }

    return actualWorldUnitSpacing;
}

function renderSTL(stlData: STLData, width: number, height: number, createImageData: (width: number, height: number) => ImageData, view: View): CameraRenderOutput {
    var imageData = createImageData(width, height);

    var start = Date.now();

    var depthBuffer = new Float64Array(width * height);
    for (var n = 0; n < depthBuffer.length; n++) {
        depthBuffer[n] = Infinity;
    }

    var cameraSet = new OrthoCameraSet(stlData.extents, width, height);
    var orthoCamera = cameraSet.cameras[view];

    var minDepth = Infinity, maxDepth = -Infinity;

    var primaryLightSource = new THREE.Vector3(0.3, -0.3, 0.6).normalize();
    var secondaryLightSource = new THREE.Vector3(-0.3, 0.3, -0.6).normalize();

    for (var i = 0; i < stlData.triangles.length; i++) {
        var tri = stlData.triangles[i];
        // http://devmaster.net/posts/6145/advanced-rasterization

        // Lighting
        var normal = tri.normal();
        var light = Math.max(0, primaryLightSource.dot(normal)) + 0.8 * Math.max(0, secondaryLightSource.dot(normal));

        // Depth of corners
        var depthA = orthoCamera.depthOf(tri.c);
        var depthB = orthoCamera.depthOf(tri.b);
        var depthC = orthoCamera.depthOf(tri.a);

        // Coordinates of corners
        var pa = orthoCamera.worldToFilm(tri.c);
        var pb = orthoCamera.worldToFilm(tri.b);
        var pc = orthoCamera.worldToFilm(tri.a);

        // http://www1.eonfusion.com/manual/index.php/Formulae_for_interpolation
        // Bilinear interpolation calculation
        // DET = determinant of the original matrix = 
        // x1 * y2 - x2 * y1 + x2 * y3 - x3 * y2 + x3 * y1 - x1 * y3
        var bl_det = pa.x * pb.y - pb.x * pa.y + pb.x * pc.y - pc.x * pb.y + pc.x * pa.y - pa.x * pc.y;

        // Triangle is basically edge-on; skip rendering it
        if (Math.abs(bl_det) < 0.0001) {
            continue;
        }

        // A = ((y2 - y3) * w1 + (y3 - y1) * w2 + (y1 - y2) * w3) / DET
        var bl_a = ((pb.y - pc.y) * depthA + (pc.y - pa.y) * depthB + (pa.y - pb.y) * depthC) / bl_det;
        // B = ((x3 - x2) * w1 + (x1 - x3) * w2 + (x2 - x1) * w3) / DET
        var bl_b = ((pc.x - pb.x) * depthA + (pa.x - pc.x) * depthB + (pb.x - pa.x) * depthC) / bl_det;
        // C = ((x2 * y3 - x3 * y2) * w1 + (x3 * y1 - x1 * y3) * w2 + (x1 * y2 - x2 * y1) * w3) / DET
        var bl_c = ((pb.x * pc.y - pc.x * pb.y) * depthA + (pc.x * pa.y - pa.x * pc.y) * depthB + (pa.x * pb.y - pb.x * pa.y) * depthC) / bl_det;

        // 28.4 fixed-point coordinates
        var Y1 = Math.round(pa.y * 16);
        var Y2 = Math.round(pb.y * 16);
        var Y3 = Math.round(pc.y * 16);

        var X1 = Math.round(pa.x * 16);
        var X2 = Math.round(pb.x * 16);
        var X3 = Math.round(pc.x * 16);

        // Deltas
        var DX12 = X1 - X2;
        var DX23 = X2 - X3;
        var DX31 = X3 - X1;

        var DY12 = Y1 - Y2;
        var DY23 = Y2 - Y3;
        var DY31 = Y3 - Y1;

        // Fixed-point deltas
        var FDX12 = DX12 << 4;
        var FDX23 = DX23 << 4;
        var FDX31 = DX31 << 4;

        var FDY12 = DY12 << 4;
        var FDY23 = DY23 << 4;
        var FDY31 = DY31 << 4;

        // Bounding rectangle
        var minx = (Math.min(X1, X2, X3) + 0xF) >> 4;
        var maxx = (Math.max(X1, X2, X3) + 0xF) >> 4;
        var miny = (Math.min(Y1, Y2, Y3) + 0xF) >> 4;
        var maxy = (Math.max(Y1, Y2, Y3) + 0xF) >> 4;

        // Block size, standard 8x8 (must be power of two)
        var q = 8;

        // Start in corner of 8x8 block
        minx &= ~(q - 1);
        miny &= ~(q - 1);

        var offsetBufferIndex = (height * width - width * (miny + q)) << 2;
        // offsetBufferIndex -= q * width;

        // Half-edge constants
        var C1 = (DY12 * X1 - DX12 * Y1);
        var C2 = (DY23 * X2 - DX23 * Y2);
        var C3 = (DY31 * X3 - DX31 * Y3);

        // Correct for fill convention
        if (DY12 < 0 || (DY12 === 0 && DX12 > 0)) C1++;
        if (DY23 < 0 || (DY23 === 0 && DX23 > 0)) C2++;
        if (DY31 < 0 || (DY31 === 0 && DX31 > 0)) C3++;

        // Loop through blocks
        for (var y = miny; y < maxy; y += q) {
            for (var x = minx; x < maxx; x += q) {
                // Corners of block
                var x0 = x << 4;
                var x1 = (x + q - 1) << 4;
                var y0 = y << 4;
                var y1 = (y + q - 1) << 4;

                // Evaluate half-space functions
                var a00 = +(C1 + DX12 * y0 - DY12 * x0 > 0);
                var a10 = +(C1 + DX12 * y0 - DY12 * x1 > 0);
                var a01 = +(C1 + DX12 * y1 - DY12 * x0 > 0);
                var a11 = +(C1 + DX12 * y1 - DY12 * x1 > 0);
                var a = (a00 << 0) | (a10 << 1) | (a01 << 2) | (a11 << 3);

                var b00 = +(C2 + DX23 * y0 - DY23 * x0 > 0);
                var b10 = +(C2 + DX23 * y0 - DY23 * x1 > 0);
                var b01 = +(C2 + DX23 * y1 - DY23 * x0 > 0);
                var b11 = +(C2 + DX23 * y1 - DY23 * x1 > 0);
                var b = (b00 << 0) | (b10 << 1) | (b01 << 2) | (b11 << 3);

                var c00 = +(C3 + DX31 * y0 - DY31 * x0 > 0);
                var c10 = +(C3 + DX31 * y0 - DY31 * x1 > 0);
                var c01 = +(C3 + DX31 * y1 - DY31 * x0 > 0);
                var c11 = +(C3 + DX31 * y1 - DY31 * x1 > 0);
                var c = (c00 << 0) | (c10 << 1) | (c01 << 2) | (c11 << 3);

                // Skip block when outside an edge
                if (a == 0 || b == 0 || c == 0) continue;

                var bi = offsetBufferIndex + ((q * width) << 2);

                // Accept whole block when totally covered
                if (a == 0xF && b == 0xF && c == 0xF) {
                    for (var iy = 0; iy < q; iy++) {
                        for (var ix = x; ix < x + q; ix++) {
                            // Bilinear interpolation
                            // w = A * x + B * y + C
                            var depth = bl_a * (ix) + bl_b * (y + iy) + bl_c;

                            var pxi = bi + (ix << 2);
                            var di = pxi >> 2;
                            if (depth < depthBuffer[di]) {
                                imageData.data[pxi + 0] = (20 + light * 150) | 0;
                                imageData.data[pxi + 1] = (light * 250) | 0;
                                imageData.data[pxi + 2] = (10 + light * 180) | 0;
                                imageData.data[pxi + 3] = 255;
                                depthBuffer[di] = depth;
                            }
                        }
                        bi -= width << 2;
                    }
                } else {
                    // Partially covered block
                    var CY1 = C1 + DX12 * y0 - DY12 * x0;
                    var CY2 = C2 + DX23 * y0 - DY23 * x0;
                    var CY3 = C3 + DX31 * y0 - DY31 * x0;

                    for (var iy = y; iy < y + q; iy++) {
                        var CX1 = CY1;
                        var CX2 = CY2;
                        var CX3 = CY3;

                        for (var ix = x; ix < x + q; ix++) {
                            if (CX1 > 0 && CX2 > 0 && CX3 > 0) {
                                // Bilinear interpolation
                                // w = A * x + B * y + C
                                var depth = bl_a * (ix) + bl_b * (iy) + bl_c;

                                var pxi = bi + (ix << 2);
                                var di = pxi >> 2;
                                if (depth < depthBuffer[di]) {
                                    imageData.data[pxi + 0] = (20 + light * 150) | 0;
                                    imageData.data[pxi + 1] = (light * 250) | 0;
                                    imageData.data[pxi + 2] = (10 + light * 180) | 0;
                                    imageData.data[pxi + 3] = 255;
                                    depthBuffer[di] = depth;
                                }
                            }

                            CX1 -= FDY12;
                            CX2 -= FDY23;
                            CX3 -= FDY31;
                        }

                        CY1 += FDX12;
                        CY2 += FDX23;
                        CY3 += FDX31;

                        bi -= (width << 2);
                    }
                }
            }

            offsetBufferIndex -= (q * width) << 2;
        }
    }

    // Outline
    var outline = createImageData(width, height);
    renderOutline(depthBuffer, width, height, outline);

    // Grid
    var grid = createImageData(width, height);
    var gridSpacing = renderGrid(orthoCamera.worldToFilm(new THREE.Vector3(0, 0, 0)), cameraSet.pixelsPerWorldUnit, width, height, grid);

    var result: CameraRenderOutput = {
        depth: depthBuffer,
        outlined: outline,
        basic: imageData,
        grid: grid,
        triangleIndex: null,
        gridSpacing: gridSpacing,
        camera: orthoCamera
    };
    console.log('Rendered ' + stlData.triangles.length + ' triangles in ' + (Date.now() - start) + 'ms');
    return result;
}
 