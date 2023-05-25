/// <reference path="Scripts\typings\jquery\jquery.d.ts" />
/// <reference path="stlParsing.ts" />
/// <reference path="knockout.d.ts" />

class ViewportViewModel {
    public name = ko.observable<string>();
    public isDefaultView = ko.observable(true);
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private scratchCanvas: HTMLCanvasElement;
    private scratchContext: CanvasRenderingContext2D;

    private renderData: CameraRenderOutput;

    private annotationsCanvas: HTMLCanvasElement;
    private annotationsContext: CanvasRenderingContext2D;

    constructor(canvasId: string, private parent: typeof ViewModel, public view: View) {
        this.name(View[view]);

        $(() => {
            this.canvas = <HTMLCanvasElement>document.getElementById(canvasId);
            this.canvas.setAttribute('width', this.canvas.clientWidth.toString());
            this.canvas.setAttribute('height', this.canvas.clientHeight.toString());
            this.context = this.canvas.getContext('2d');

            var createShadowCanvas = () => {
                var cv = document.createElement('canvas');
                cv.setAttribute('width', this.canvas.clientWidth.toString());
                cv.setAttribute('height', this.canvas.clientHeight.toString());
                return cv;
            }

            this.scratchCanvas = createShadowCanvas();
            this.scratchContext = this.scratchCanvas.getContext('2d');

            this.annotationsCanvas = createShadowCanvas();
            this.annotationsContext = this.annotationsCanvas.getContext('2d');

            this.canvas.addEventListener('mousemove', (event) => this.mouseMoved(event));
        });
    }

    addLinearMeasure(m: LinearMeasure) {
        Measure.renderLinearMeasure(m, this.annotationsContext, this.renderData.camera);
        this.repaint();
    }

    addDiameterMeasure(m: DiameterMeasure) {
        Measure.renderDiameterMeasure(m, this.annotationsContext, this.renderData.camera);
        this.repaint();
    }

    mouseMoved(event: MouseEvent) {
        if (this.renderData !== undefined) {
            var rect = this.canvas.getBoundingClientRect();
            var x = event.clientX - rect.left;
            var y = rect.bottom - event.clientY;
            var otherY = event.clientY - rect.top;
            var ray = this.renderData.camera.filmToWorld({ x: x, y: y });
            var i = Math.round(otherY) * this.renderData.basic.width + Math.round(x);
            var depth = this.renderData.depth[i];
            if (ray.direction.x !== 0) ray.origin.x = ray.origin.x + depth * ray.direction.x;
            if (ray.direction.y !== 0) ray.origin.y = ray.origin.y + depth * ray.direction.y;
            if (ray.direction.z !== 0) ray.origin.z = ray.origin.z + depth * ray.direction.z;
            this.parent.position(ray.origin.x.toFixed(1) + ', ' + ray.origin.y.toFixed(1) + ', ' + ray.origin.z.toFixed(1));
        }
    }

    acceptSTL = (data: STLData) => {
        this.renderData = renderSTL(data, this.canvas.width, this.canvas.height, (w, h) => this.context.createImageData(w, h), this.view);
        this.parent.gridSpacing('Grid: ' + this.renderData.gridSpacing);
        this.annotationsContext.clearRect(0, 0, this.annotationsCanvas.width, this.annotationsCanvas.height);
        this.repaint();
    }

    toggle = () => {
        console.log('toggle');
        this.isDefaultView(!this.isDefaultView());
        this.repaint();
    }

    repaint = () => {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (var i = 0; i < this.parent.layers.length; i++) {
            if (this.parent.layers[i].value()) {
                this.scratchContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
                switch (this.parent.layers[i].layer) {
                    case Layer.Shading:
                        this.scratchContext.putImageData(this.renderData.basic, 0, 0);
                        break;
                    case Layer.Outline:
                        this.scratchContext.putImageData(this.renderData.outlined, 0, 0);
                        break;
                    case Layer.Grid:
                        this.scratchContext.putImageData(this.renderData.grid, 0, 0);
                        break;
                    case Layer.Annotations:
                        this.scratchContext.drawImage(this.annotationsCanvas, 0, 0);
                        break;
                }
                this.context.drawImage(this.scratchCanvas, 0, 0);
            }
        }
    }
}

enum Layer {
    Annotations,
    Grid,
    Outline,
    Shading
}

module ViewModel {
    /** Samples **/
    var samples: { name: string; url: string; loadSample?: () => void; }[] = [
        { url: "./sample.stl", name: "Flange" },
        { url: "./jig.stl", name: "Jig" },
        { url: "./hook.stl", name: "Hook" },
        { url: "./bunny.stl", name: "Bunny" },
        { url: "./doll.stl", name: "Doll" },
        { url: "./owl.stl", name: "Owl" },
        { url: "./sue.stl", name: "Sue" },
        { url: "./terminator.stl", name: "Terminator" }
    ];
    samples.forEach(s => s.loadSample = () => loadSample(s.url));
    export var sampleButtons = ko.observableArray(samples);
    export function loadSample(url: string) {
        loadFile(url);
    };

    /** General stuff **/
    export var name = ko.observable('');

    /** Top bar **/
    export var userMessage = ko.observable(<string>undefined);
    export var topBar = ko.computed(() => (userMessage() || name()));

    /** Status bar **/
    export var status = ko.observable('Ready');
    export var gridSpacing = ko.observable('No model loaded');
    export var position = ko.observable('0.0, 0.0, 0.0');

    /** Viewports **/
    export var topView = new ViewportViewModel('top', ViewModel, View.Top);
    export var frontView = new ViewportViewModel('front', ViewModel, View.Front);
    export var leftView = new ViewportViewModel('left', ViewModel, View.Left);

    /** Display Layers **/
    export var layers: {
        name: string;
        value: KnockoutObservable<boolean>;
        layer: Layer;
    }[] = [];

    /** Events **/
    export var onReady = () => { };

    export function addLinearMeasure() {
        ViewModel.userMessage('Add linear measure now');
    }

    function addLayer(layer: Layer, defaultValue: boolean) {
        var storageName = 'layer_' + Layer[layer];
        var storedValue = window.localStorage.getItem(storageName);
        if (storedValue !== undefined) defaultValue = (storedValue === 'true');
        var obv = ko.observable(defaultValue);
        obv.subscribe((newValue) => {
            window.localStorage.setItem(storageName, newValue.toString());
            topView.repaint();
            frontView.repaint();
            leftView.repaint();
        });

        layers.push({ name: Layer[layer], value: obv, layer: layer });
    }
    // Note: These need to be in back-to-front order
    addLayer(Layer.Grid, true);
    addLayer(Layer.Shading, false);
    addLayer(Layer.Outline, true);
    addLayer(Layer.Annotations, true);

    /** 'File' commands **/
    export function loadFile(url: string) {
        status('Downloading ' + url + '...');
        name(url);

        var xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.responseType = "arraybuffer";

        xhr.onload = function () {
            status('Parsing...');

            window.requestAnimationFrame(() => {
                console.log('Parse next');
                parseSTL(xhr.response, stl => {
                    var tasks: { (): void; }[] = [];
                    function nextTask() {
                        tasks.shift()();
                        if (tasks.length > 0) window.requestAnimationFrame(nextTask);
                    }

                    /*
                    var now = Date.now();
                    console.log('Validating STL manifold (fasterer)...');


                    var vertexList: {
                        p1: THREE.Vector3; p2: THREE.Vector3; matched?: boolean;
                    }[] = [];
                    for (var i = 0; i < stl.triangles.length; i++) {
                        vertexList.push({ p1: stl.triangles[i].a, p2: stl.triangles[i].b });
                        vertexList.push({ p1: stl.triangles[i].b, p2: stl.triangles[i].c });
                        vertexList.push({ p1: stl.triangles[i].c, p2: stl.triangles[i].a });
                    }
                    // Ensure each half-edge has a matching opposite half-edge
                    for (var i = 0; i < vertexList.length; i++) {
                        var occurences = 0;
                        var lhs = vertexList[i];
                        if (lhs.matched) continue;
                        for (var j = 0; j < vertexList.length; j++) {
                            var rhs = vertexList[j];
                            if (rhs.matched) continue;
                            if (lhs.p1.equals(rhs.p2) && lhs.p2.equals(rhs.p1)) {
                                occurences++;
                                rhs.matched = true;
                            }
                        }
                        if (occurences !== 1) {
                            console.log('saw a mismatched edge');
                        }
                    }

                    console.log('Validated STL manifold in ' + (Date.now() - now));
                    */
                    console.log('The mesh has ' + stl.triangles.length + ' triangles');

                    tasks.push(() => status('Rendering top...'));
                    tasks.push(() => topView.acceptSTL(stl));
                    tasks.push(() => status('Rendering front...'));
                    tasks.push(() => frontView.acceptSTL(stl));
                    tasks.push(() => status('Rendering side...'));
                    tasks.push(() => leftView.acceptSTL(stl));
                    tasks.push(() => status('Ready'));
                    tasks.push(() => onReady && onReady());

                    nextTask();
                });
            });
        }

        xhr.send();
    }
}

$(() => {
    ko.applyBindings(ViewModel);

    ViewModel.loadSample('./sample.stl');
    ViewModel.onReady = () => {
        ViewModel.topView.addLinearMeasure({
            start: { x: -20, y: -22, z: 0 },
            end: { x: 10, y: -22, z: 0 },
            labelPositioning: 0.5,
            offsetDistance: 0,
            text: '30'
        });

        ViewModel.topView.addLinearMeasure({
            start: { x: -30, y: -15, z: 0 },
            end: { x: -30, y: 15, z: 0 },
            labelPositioning: 0.5,
            offsetDistance: 0,
            text: '30'
        });

        ViewModel.topView.addDiameterMeasure({
            center: { x: 0, y: 0, z: 0 },
            diameter: 14,
            text: '⌀14'
        });
    };

});

