var stopwatch = function () {
    var stack: string[] = [];
    var resultStack: string[] = [];
    function sw(name: string) {
        stack.push(name);
        var start = Date.now();
        var i = resultStack.push('placeholder for ' + name) - 1;
        return {
            end: function () {
                var end = Date.now();
                var name = stack.pop();
                resultStack[i] = new Array(stack.length + 1).join(' ') + name + ': ' + ((end - start) / 1000).toFixed(2) + 's';
                if (stack.length === 0) {
                    // resultStack.reverse();
                    console.log(resultStack.join('\n* '));
                    resultStack = [];
                }
            }
        }
    }
    return sw;
} ();

function downloadFile(url: string, callback: (s: ArrayBuffer) => void) {
    var download = stopwatch('Download ' + url);
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";

    xhr.onload = function () {
        download.end();
        var data: ArrayBuffer = xhr.response;
        callback(data);
    }

    xhr.send();
}

