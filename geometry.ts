module Geometry {
    export interface Bounds3d {
        minX: number; minY: number; minZ: number;
        maxX: number; maxY: number; maxZ: number;
        sizeX: number; sizeY: number; sizeZ: number;
    }

    export interface Bounds2d {
        minX: number; minY: number;
        maxX: number; maxY: number;
        sizeX: number; sizeY: number;
    }

    export interface ImageSize {
        width: number;
        height: number;
    }

    export interface CameraSet<T> {
        top: T;
        front: T;
        right: T;
    }

    export interface OrthoCamera {
        xx: number; yx: number; zx: number;
        xy: number; yy: number; zy: number;
    }

    export interface CameraAndScale {
        camera: OrthoCamera;
        scale: CameraToPixel;
    }

    export interface CameraToPixel {
        /// Scale from camera coordinates -> pixels
        scale: number;
        /// x offset, in pixels (should be subtracted as a last step)
        xOffset: number;
        /// y offset, in pixels (should be subtracted as a last step)
        yOffset: number;
    }

    /** paddingFactor is how much of the image should be 'reserved', on one side, along its tightest border,
    i.e. a paddingFactor of 0.1 leaves the top 10% and the bottom 10% of the image empty
    */
    export function calculateCameraToPixel(camera: OrthoCamera, modelBounds: Bounds3d, imageSize: ImageSize, paddingFactor = 0.1): CameraToPixel {
        if (paddingFactor > 0.5) throw new Error('Padding factor must be less than 0.5');
        var viewingWindow = calculateViewingWindow(camera, modelBounds);
        // Want pixels per camera unit so divide pixels/cu
        var scaleX = (imageSize.width * (1 - paddingFactor * 2)) / viewingWindow.sizeX;
        var scaleY = (imageSize.height * (1 - paddingFactor * 2)) / viewingWindow.sizeY;
        // We want the 'smallest' scale that fits
        var scale = Math.min(scaleX, scaleY);

        return calculateCameraToPixelWithScale(camera, modelBounds, imageSize, scale);
    }

    export function calculateCameraToPixelWithScale(camera: OrthoCamera, modelBounds: Bounds3d, imageSize: ImageSize, scale: number): CameraToPixel {
        var viewingWindow = calculateViewingWindow(camera, modelBounds);
        // Now redistribute the excess image area so the result is centered
        var offsetX = ((viewingWindow.sizeX * scale) - imageSize.width) / 2;
        var offsetY = ((viewingWindow.sizeY * scale) - imageSize.height) / 2;

        // Add these offsets to the original offsets implied by the camera matrix
        offsetX += viewingWindow.minX * scale;
        offsetY += viewingWindow.minY * scale;

        return {
            scale: scale,
            xOffset: offsetX,
            yOffset: offsetY
        };
    }
    
    export function calculateMultipleViewCameraToPixel(cameras: CameraSet<OrthoCamera>, modelBounds: Bounds3d, imageSize: ImageSize, paddingFactor = 0.1): CameraSet<CameraToPixel> {
        var top = calculateCameraToPixel(cameras.top, modelBounds, imageSize, paddingFactor);
        var front = calculateCameraToPixel(cameras.front, modelBounds, imageSize, paddingFactor);
        var right = calculateCameraToPixel(cameras.right, modelBounds, imageSize, paddingFactor);

        var actualScale = Math.min(top.scale, front.scale, right.scale);

        return {
            top: calculateCameraToPixelWithScale(cameras.top, modelBounds, imageSize, actualScale),
            front: calculateCameraToPixelWithScale(cameras.front, modelBounds, imageSize, actualScale),
            right: calculateCameraToPixelWithScale(cameras.right, modelBounds, imageSize, actualScale)
        };
    }

    export function calculateViewingWindow(camera: OrthoCamera, bounds: Bounds3d): Bounds2d {
        function calculate(x: number, y: number, z: number) {
            return {
                x: x * camera.xx + y * camera.yx + z * camera.zx,
                y: x * camera.xy + y * camera.yy + z * camera.zy
            }
        }
        var x = [bounds.minX, bounds.maxX];
        var y = [bounds.minY, bounds.maxY];
        var z = [bounds.minZ, bounds.maxZ];
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < 8; i++) {
            var p = calculate(x[i & 1], y[(i >> 1) & 1], z[(i >> 2) & 1]);
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        }
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, sizeX: maxX - minX, sizeY: maxY - minY };
    }

    export function getMeshBounds(triMesh: TriangleMesh): Bounds3d {
        var time = stopwatch("Calculate mesh bounds of " + triMesh.coordX.length + " coordinates");
        if (triMesh.coordX.length > 50000) {
            var minX = Infinity, minY = Infinity, minZ = Infinity;
            var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (var i = 0; i < triMesh.coordX.length; i++) {
                if (triMesh.coordX[i] < minX) minX = triMesh.coordX[i];
                if (triMesh.coordY[i] < minY) minY = triMesh.coordY[i];
                if (triMesh.coordZ[i] < minZ) minZ = triMesh.coordZ[i];
                if (triMesh.coordX[i] > maxX) maxX = triMesh.coordX[i];
                if (triMesh.coordY[i] > maxY) maxY = triMesh.coordY[i];
                if (triMesh.coordZ[i] > maxZ) maxZ = triMesh.coordZ[i];
            }
        } else {
            var minX: number = Math.min.apply(Math, triMesh.coordX);
            var maxX: number = Math.max.apply(Math, triMesh.coordX);
            var minY: number = Math.min.apply(Math, triMesh.coordY);
            var maxY: number = Math.max.apply(Math, triMesh.coordY);
            var minZ: number = Math.min.apply(Math, triMesh.coordZ);
            var maxZ: number = Math.max.apply(Math, triMesh.coordZ);
        }
        time.end();
        return {
            minX: minX, minY: minY, minZ: minZ,
            maxX: maxX, maxY: maxY, maxZ: maxZ,
            sizeX: maxX - minX, sizeY: maxY - minY, sizeZ: maxZ - minZ
        };
    }

    export function padBounds3d(bounds: Bounds3d, padFactor: number): Bounds3d {
        return {
            minX: bounds.minX - bounds.sizeX * padFactor,
            minY: bounds.minY - bounds.sizeY * padFactor,
            minZ: bounds.minZ - bounds.sizeZ * padFactor,
            maxX: bounds.maxX + bounds.sizeX * padFactor,
            maxY: bounds.maxY + bounds.sizeY * padFactor,
            maxZ: bounds.maxZ + bounds.sizeZ * padFactor,
            sizeX: bounds.sizeX * (1 + padFactor * 2),
            sizeY: bounds.sizeY * (1 + padFactor * 2),
            sizeZ: bounds.sizeZ * (1 + padFactor * 2)
        };
    }

    export function getForwardVector(camera: OrthoCamera) {
        var x = camera.yy * camera.zx - camera.zy * camera.yx;
        var y = camera.zy * camera.xx - camera.xy * camera.zx;
        var z = camera.xy * camera.yx - camera.yy * camera.xx;
        var m = Math.sqrt(x * x + y * y + z * z);
        return { x: x / m, y: y / m, z: z / m };
    }
}

module Cameras {
    export var Top: Geometry.OrthoCamera = {
        xx: 1, yx: 0, zx: 0,
        xy: 0, yy: -1, zy: 0
    };
    export var Bottom: Geometry.OrthoCamera = {
        xx: 1, yx: 0, zx: 0,
        xy: 0, yy: 1, zy: 0
    };
    export var Left: Geometry.OrthoCamera = {
        xx: 0, yx: -1, zx: 0,
        xy: 0, yy: 0, zy: 1
    };
    export var Right: Geometry.OrthoCamera = {
        xx: 0, yx: 1, zx: 0,
        xy: 0, yy: 0, zy: 1
    };
    export var Front: Geometry.OrthoCamera = {
        xx: 1, yx: 0, zx: 0,
        xy: 0, yy: 0, zy: -1
    };
    export var Back: Geometry.OrthoCamera = {
        xx: -1, yx: 0, zx: 0,
        xy: 0, yy: 0, zy: 1
    };

    export module Isometric {
        function normalize(c: Geometry.OrthoCamera) {
            var xm = Math.sqrt(c.xx * c.xx + c.yx * c.yx + c.zx * c.zx);
            var ym = Math.sqrt(c.xy * c.xy + c.yy * c.yy + c.zy * c.zy);
            c.xx /= xm;
            c.yx /= xm;
            c.zx /= xm;
            c.xy /= ym;
            c.yy /= ym;
            c.zy /= ym;
        }

        export var FrontOverhead: Geometry.OrthoCamera = {
            xx: 1, yx: 1, zx: 0,
            xy: 1, yy: -1, zy: -3.717
        };

        normalize(FrontOverhead);
    }
}
