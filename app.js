/// <reference path="Scripts\typings\jquery\jquery.d.ts" />
/// <reference path="stlParsing.ts" />
/// <reference path="knockout.d.ts" />
var ViewportViewModel = (function () {
    function ViewportViewModel(canvasId, parent, view) {
        var _this = this;
        this.parent = parent;
        this.view = view;
        this.name = ko.observable();
        this.isDefaultView = ko.observable(true);
        this.acceptSTL = function (data) {
            _this.renderData = renderSTL(data, _this.canvas.width, _this.canvas.height, function (w, h) {
                return _this.context.createImageData(w, h);
            }, _this.view);
            _this.parent.gridSpacing('Grid: ' + _this.renderData.gridSpacing);
            _this.annotationsContext.clearRect(0, 0, _this.annotationsCanvas.width, _this.annotationsCanvas.height);
            _this.repaint();
        };
        this.toggle = function () {
            console.log('toggle');
            _this.isDefaultView(!_this.isDefaultView());
            _this.repaint();
        };
        this.repaint = function () {
            _this.context.clearRect(0, 0, _this.canvas.width, _this.canvas.height);

            for (var i = 0; i < _this.parent.layers.length; i++) {
                if (_this.parent.layers[i].value()) {
                    _this.scratchContext.clearRect(0, 0, _this.canvas.width, _this.canvas.height);
                    switch (_this.parent.layers[i].layer) {
                        case 3 /* Shading */:
                            _this.scratchContext.putImageData(_this.renderData.basic, 0, 0);
                            break;
                        case 2 /* Outline */:
                            _this.scratchContext.putImageData(_this.renderData.outlined, 0, 0);
                            break;
                        case 1 /* Grid */:
                            _this.scratchContext.putImageData(_this.renderData.grid, 0, 0);
                            break;
                        case 0 /* Annotations */:
                            _this.scratchContext.drawImage(_this.annotationsCanvas, 0, 0);
                            break;
                    }
                    _this.context.drawImage(_this.scratchCanvas, 0, 0);
                }
            }
        };
        this.name(View[view]);

        $(function () {
            _this.canvas = document.getElementById(canvasId);
            _this.canvas.setAttribute('width', _this.canvas.clientWidth.toString());
            _this.canvas.setAttribute('height', _this.canvas.clientHeight.toString());
            _this.context = _this.canvas.getContext('2d');

            var createShadowCanvas = function () {
                var cv = document.createElement('canvas');
                cv.setAttribute('width', _this.canvas.clientWidth.toString());
                cv.setAttribute('height', _this.canvas.clientHeight.toString());
                return cv;
            };

            _this.scratchCanvas = createShadowCanvas();
            _this.scratchContext = _this.scratchCanvas.getContext('2d');

            _this.annotationsCanvas = createShadowCanvas();
            _this.annotationsContext = _this.annotationsCanvas.getContext('2d');

            _this.canvas.addEventListener('mousemove', function (event) {
                return _this.mouseMoved(event);
            });
        });
    }
    ViewportViewModel.prototype.addLinearMeasure = function (m) {
        Measure.renderLinearMeasure(m, this.annotationsContext, this.renderData.camera);
        this.repaint();
    };

    ViewportViewModel.prototype.addDiameterMeasure = function (m) {
        Measure.renderDiameterMeasure(m, this.annotationsContext, this.renderData.camera);
        this.repaint();
    };

    ViewportViewModel.prototype.mouseMoved = function (event) {
        if (this.renderData !== undefined) {
            var rect = this.canvas.getBoundingClientRect();
            var x = event.clientX - rect.left;
            var y = rect.bottom - event.clientY;
            var otherY = event.clientY - rect.top;
            var ray = this.renderData.camera.filmToWorld({ x: x, y: y });
            var i = Math.round(otherY) * this.renderData.basic.width + Math.round(x);
            var depth = this.renderData.depth[i];
            if (ray.direction.x !== 0)
                ray.origin.x = ray.origin.x + depth * ray.direction.x;
            if (ray.direction.y !== 0)
                ray.origin.y = ray.origin.y + depth * ray.direction.y;
            if (ray.direction.z !== 0)
                ray.origin.z = ray.origin.z + depth * ray.direction.z;
            this.parent.position(ray.origin.x.toFixed(1) + ', ' + ray.origin.y.toFixed(1) + ', ' + ray.origin.z.toFixed(1));
        }
    };
    return ViewportViewModel;
})();

var Layer;
(function (Layer) {
    Layer[Layer["Annotations"] = 0] = "Annotations";
    Layer[Layer["Grid"] = 1] = "Grid";
    Layer[Layer["Outline"] = 2] = "Outline";
    Layer[Layer["Shading"] = 3] = "Shading";
})(Layer || (Layer = {}));

var ViewModel;
(function (ViewModel) {
    /** Samples **/
    var samples = [
        { url: "./sample.stl", name: "Flange" },
        { url: "./jig.stl", name: "Jig" },
        { url: "./hook.stl", name: "Hook" },
        { url: "./bunny.stl", name: "Bunny" },
        { url: "./doll.stl", name: "Doll" },
        { url: "./owl.stl", name: "Owl" },
        { url: "./sue.stl", name: "Sue" },
        { url: "./terminator.stl", name: "Terminator" }
    ];
    samples.forEach(function (s) {
        return s.loadSample = function () {
            return loadSample(s.url);
        };
    });
    ViewModel.sampleButtons = ko.observableArray(samples);
    function loadSample(url) {
        loadFile(url);
    }
    ViewModel.loadSample = loadSample;
    ;

    /** General stuff **/
    ViewModel.name = ko.observable('');

    /** Top bar **/
    ViewModel.userMessage = ko.observable(undefined);
    ViewModel.topBar = ko.computed(function () {
        return (ViewModel.userMessage() || ViewModel.name());
    });

    /** Status bar **/
    ViewModel.status = ko.observable('Ready');
    ViewModel.gridSpacing = ko.observable('No model loaded');
    ViewModel.position = ko.observable('0.0, 0.0, 0.0');

    /** Viewports **/
    ViewModel.topView = new ViewportViewModel('top', ViewModel, 0 /* Top */);
    ViewModel.frontView = new ViewportViewModel('front', ViewModel, 4 /* Front */);
    ViewModel.leftView = new ViewportViewModel('left', ViewModel, 2 /* Left */);

    /** Display Layers **/
    ViewModel.layers = [];

    /** Events **/
    ViewModel.onReady = function () {
    };

    function addLinearMeasure() {
        ViewModel.userMessage('Add linear measure now');
    }
    ViewModel.addLinearMeasure = addLinearMeasure;

    function addLayer(layer, defaultValue) {
        var storageName = 'layer_' + Layer[layer];
        var storedValue = window.localStorage.getItem(storageName);
        if (storedValue !== undefined)
            defaultValue = (storedValue === 'true');
        var obv = ko.observable(defaultValue);
        obv.subscribe(function (newValue) {
            window.localStorage.setItem(storageName, newValue.toString());
            ViewModel.topView.repaint();
            ViewModel.frontView.repaint();
            ViewModel.leftView.repaint();
        });

        ViewModel.layers.push({ name: Layer[layer], value: obv, layer: layer });
    }

    // Note: These need to be in back-to-front order
    addLayer(1 /* Grid */, true);
    addLayer(3 /* Shading */, false);
    addLayer(2 /* Outline */, true);
    addLayer(0 /* Annotations */, true);

    /** 'File' commands **/
    function loadFile(url) {
        ViewModel.status('Downloading ' + url + '...');
        ViewModel.name(url);

        var xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.responseType = "arraybuffer";

        xhr.onload = function () {
            ViewModel.status('Parsing...');

            window.requestAnimationFrame(function () {
                console.log('Parse next');
                parseSTL(xhr.response, function (stl) {
                    var tasks = [];
                    function nextTask() {
                        tasks.shift()();
                        if (tasks.length > 0)
                            window.requestAnimationFrame(nextTask);
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

                    tasks.push(function () {
                        return ViewModel.status('Rendering top...');
                    });
                    tasks.push(function () {
                        return ViewModel.topView.acceptSTL(stl);
                    });
                    tasks.push(function () {
                        return ViewModel.status('Rendering front...');
                    });
                    tasks.push(function () {
                        return ViewModel.frontView.acceptSTL(stl);
                    });
                    tasks.push(function () {
                        return ViewModel.status('Rendering side...');
                    });
                    tasks.push(function () {
                        return ViewModel.leftView.acceptSTL(stl);
                    });
                    tasks.push(function () {
                        return ViewModel.status('Ready');
                    });
                    tasks.push(function () {
                        return ViewModel.onReady && ViewModel.onReady();
                    });

                    nextTask();
                });
            });
        };

        xhr.send();
    }
    ViewModel.loadFile = loadFile;
})(ViewModel || (ViewModel = {}));

$(function () {
    ko.applyBindings(ViewModel);

    ViewModel.loadSample('./sample.stl');
    ViewModel.onReady = function () {
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
//# sourceMappingURL=app.js.map
