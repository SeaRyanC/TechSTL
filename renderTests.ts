/// <reference path="Scripts\typings\jquery\jquery.d.ts" />
/// <reference path="arrayRenderer.ts" />
/// <reference path="Scripts/threemodule.d.ts" />

/*
$(() => {
    loadFile('./jig.stl');
    loadFile('./sander.stl');
    loadFile('./hook.stl');
});
*/

var testFiles = [
//    'bunny.stl',
//     'owl.stl',
    'cube.stl',
    'cube2.stl',
    'lego.stl',
    'sphere.stl',
//    'text.stl',
 //   'hook.stl'
//    'sue.stl'
].map(s => '/Samples/' + s);
function loadNextFile() {
    if (testFiles.length === 0) return;
  
    var next = testFiles.shift();
    var timer = stopwatch(next);
    STL.downloadSTL(next, (mesh) => {
        var size = { width: 400, height: 400 };
        document.body.appendChild(renderDiagnosticImages(Cameras.Front, mesh, size));
        document.body.appendChild(renderDiagnosticImages(Cameras.Isometric.FrontOverhead, mesh, size));
        document.body.appendChild(renderDiagnosticImages(Cameras.Top, mesh, size));
        timer.end();
        loadNextFile();
    });
}
$(loadNextFile);

function renderDiagnosticImages(camera: Geometry.OrthoCamera, triMesh: TriangleMesh, size: Geometry.ImageSize) {
    var cameraScale = Geometry.calculateCameraToPixel(camera, Geometry.getMeshBounds(triMesh), size, 0.05);
    var cameraAndScale: Geometry.CameraAndScale = { camera: camera, scale: cameraScale };

    var container = document.createElement('div');
    
    // Triangles
    var triangleCanvas = CanvasUtilities.createCanvas(size);
    var triangleContext = triangleCanvas.getContext('2d');
    var triangleResult = Rendering.renderTriangles(triangleContext, triMesh, size, cameraAndScale);
    CanvasUtilities.renderImageDataToCanvas(triangleContext, triangleResult.imageData);
    container.appendChild(triangleCanvas);

    // Depth buffer
    // container.appendChild(CanvasUtilities.renderToNewCanvas(size, c => Rendering.Diagnostics.renderDepthBuffer(c, triangleResult)));

    // Canvas-based outlining
    // container.appendChild(CanvasUtilities.renderToNewCanvas(size, c => Rendering.Diagnostics.renderEdgesToCanvas(c, triangleResult)));

    // Bresenham-based outlining
    // container.appendChild(CanvasUtilities.renderToNewCanvas(size, c => Rendering.renderOutlining(c, triangleResult)));

    // Triangle indexing
    // container.appendChild(CanvasUtilities.renderToNewCanvas(size, c => Rendering.Diagnostics.renderTriangles(c, triangleResult)));

    // var outlining = renderToNewCanvas(ssize, c => renderOutlinesToImageData(c, triMesh, output.depthBuffer, output.triangleBuffer, imgWidth, imgHeight, rawCamera, rawCameraScale));
    return container;
}


function renderMeshView(triMesh: TriangleMesh) {
    var total = stopwatch('Mesh view');
    var imgWidth = 600;
    var imgHeight = 400;
    var imgSize = { width: imgWidth, height: imgHeight };
    var cvWidth = imgWidth * 2;
    var cvHeight = imgHeight * 2;
    var cv = document.createElement('canvas');
    cv.setAttribute('width', cvWidth.toString());
    cv.setAttribute('height', cvHeight.toString());
    
    var ctx = cv.getContext('2d');
    // var data = ctx.getImageData(0, 0, width, height);

    var meshBounds = Geometry.getMeshBounds(triMesh);
    var cameraSet: Geometry.CameraSet<Geometry.OrthoCamera> = { front: Cameras.Front, top: Cameras.Top, right: Cameras.Right };
    var cameraScale = Geometry.calculateMultipleViewCameraToPixel(cameraSet, meshBounds, imgSize, 0.1);
    /*
    function render(camera: OrthoCamera, scale: CameraToPixel) {
        ctx.translate(0, imgHeight);
        ctx.scale(1, -1);
        var triTimer = stopwatch('triangle render');
        renderMeshTrianglesToContext(ctx, triMesh, imgWidth, imgHeight, camera, scale);
        triTimer.end();
        var edgeTimer = stopwatch('edge render');
        renderMeshToContext(ctx, triMesh, imgWidth, imgHeight, camera, scale);
        edgeTimer.end();
        ctx.scale(1, -1);
        ctx.translate(0, -imgHeight);
    }

    var s = stopwatch('Render to canvas x3');
    render(cameraSet.top, cameraScale.top);
    ctx.translate(0, imgHeight);
    render(cameraSet.front, cameraScale.front);
    ctx.translate(imgWidth, 0);
    render(cameraSet.right, cameraScale.right);
    ctx.translate(0, -imgHeight);
    var perspectiveCameraSize = calculateCameraToPixel(Cameras.Isometric.FrontOverhead, meshBounds, imgSize);
    render(Cameras.Isometric.FrontOverhead, perspectiveCameraSize);
    s.end();
    var rawCanvas = document.createElement('canvas');
    rawCanvas.setAttribute('width', imgWidth.toString());
    rawCanvas.setAttribute('height', imgHeight.toString());
    var rawCtx = rawCanvas.getContext('2d');
    var raster = stopwatch('raster');
    var rawCamera = Cameras.Isometric.FrontOverhead;
    var rawCameraScale = calculateCameraToPixel(rawCamera, getMeshBounds(triMesh), { width: imgWidth, height: imgHeight });
    var output = renderMeshTrianglesImageData(rawCtx, triMesh, imgWidth, imgHeight, rawCamera, rawCameraScale);
    raster.end();
    // document.body.appendChild(rawCanvas);
    total.end();
    var outlines = renderOutlinesToImageData(rawCtx, triMesh, output.depthBuffer, output.triangleBuffer, imgWidth, imgHeight, rawCamera, rawCameraScale);
    renderImageDataToCanvas(rawCtx, outlines);

    var depth = renderDepthBuffer(rawCtx, imgWidth, imgHeight, output.depthBuffer);
    renderImageDataToCanvas(rawCtx, depth);

    var tri = renderTriangleBuffer(rawCtx, imgWidth, imgHeight, output.triangleBuffer);
    renderImageDataToCanvas(rawCtx, tri);

    renderMeshToContext(rawCtx, triMesh, imgWidth, imgHeight, rawCamera, rawCameraScale);

    return rawCanvas;
    */
}

module CanvasUtilities {
    export function renderToNewCanvas(size: Geometry.ImageSize, render: (c: CanvasRenderingContext2D) => ImageData);
    export function renderToNewCanvas(size: Geometry.ImageSize, render: (c: CanvasRenderingContext2D) => void);
    export function renderToNewCanvas(size: Geometry.ImageSize, render: (c: CanvasRenderingContext2D) => ImageData) {
        var canvas = createCanvas(size);
        var context = canvas.getContext('2d');
        var data = render(context);
        if (data !== undefined) {
            renderImageDataToCanvas(context, data);
        }
        return canvas;
    }

    export function renderImageDataToCanvas(canvas: CanvasRenderingContext2D, imageData: ImageData) {
        var hiddenCanvas = createCanvas(imageData);
        hiddenCanvas.getContext("2d").putImageData(imageData, 0, 0);
        canvas.drawImage(hiddenCanvas, 0, 0);
    }


    export function createCanvas(size: Geometry.ImageSize) {
        var cv = document.createElement('canvas');
        cv.setAttribute('width', size.width.toString());
        cv.setAttribute('height', size.height.toString());
        return cv;
    }
}