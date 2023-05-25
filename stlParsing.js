var STL;
(function (STL) {
    function parseTextSTL(data) {
        var timer = stopwatch('Parse text STL triangles');
        var startIndex = data.indexOf('facet normal');

        var ax = 0, ay = 0, az = 0;
        var bx = 0, by = 0, bz = 0;
        var cx = 0, cy = 0, cz = 0;

        var vertexLookup = {};

        var coordX = [], coordY = [], coordZ = [];
        var triA = [], triB = [], triC = [];
        var normalsX = [], normalsY = [], normalsZ = [];

        var vertexCounter = 0;
        while (true) {
            startIndex = data.indexOf('vertex', startIndex) + 7; // 7: "vertex ".length
            if (startIndex === 6)
                break;

            var eolIndex = data.indexOf('\n', startIndex);
            var entireThing = data.substr(startIndex, eolIndex - startIndex - 1);

            var vertexIndex = vertexLookup[entireThing];
            if (vertexIndex === undefined) {
                var yIndex = data.indexOf(' ', startIndex) + 1;
                var zIndex = data.indexOf(' ', yIndex) + 1;
                var x = parseFloat(data.substr(startIndex, yIndex - startIndex));
                var y = parseFloat(data.substr(yIndex, zIndex - yIndex));
                var z = parseFloat(data.substr(zIndex, eolIndex - zIndex));
                vertexIndex = coordX.length;
                coordX.push(x);
                coordY.push(y);
                coordZ.push(z);
                vertexLookup[entireThing] = vertexIndex;
            }

            if (vertexCounter === 0) {
                ax = coordX[vertexIndex];
                ay = coordY[vertexIndex];
                az = coordZ[vertexIndex];
                triA.push(vertexIndex);
                vertexCounter = 1;
            } else if (vertexCounter === 1) {
                bx = coordX[vertexIndex];
                by = coordY[vertexIndex];
                bz = coordZ[vertexIndex];
                triB.push(vertexIndex);
                vertexCounter = 2;
            } else {
                cx = coordX[vertexIndex];
                cy = coordY[vertexIndex];
                cz = coordZ[vertexIndex];
                triC.push(vertexIndex);
                vertexCounter = 0;

                // Calculate the normal
                // http://math.stackexchange.com/questions/305642/how-to-find-surface-normal-of-a-triangle
                var nx = (by - ay) * (cz - az) - (cy - ay) * (bz - az);
                var ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
                var nz = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);

                // Normalize
                var nd = Math.sqrt(nx * nx + ny * ny + nz * nz);
                normalsX.push(nx / nd);
                normalsY.push(ny / nd);
                normalsZ.push(nz / nd);
            }

            startIndex = eolIndex + 1;
        }

        timer.end();
        return matchEdges({
            coordX: coordX, coordY: coordY, coordZ: coordZ,
            normalsX: normalsX, normalsY: normalsY, normalsZ: normalsZ,
            triA: triA, triB: triB, triC: triC
        });
    }
    STL.parseTextSTL = parseTextSTL;

    function matchEdges(mesh) {
        function registerClockwiseEdge(startVertexIndex, endVertexIndex, normalIndex) {
            var forwardName = startVertexIndex + '_' + endVertexIndex;
            edgeLookup[forwardName] = edgeStarts.length;
            edgeStarts.push(startVertexIndex);
            edgeEnds.push(endVertexIndex);
            edgeLeftNormals.push(normalIndex);
        }

        function registerCounterClockwiseEdge(startVertexIndex, endVertexIndex, normalIndex) {
            var reverseName = endVertexIndex + '_' + startVertexIndex;
            var reverseIndex = edgeLookup[reverseName];
            if (reverseIndex !== undefined) {
                edgeRightNormals[reverseIndex] = normalIndex;
            } else {
                console.log('non-manifold mesh detected'); // what do I do now :(
            }
        }

        var completedMesh = mesh;

        // Lookup from name => edge index
        var edgeLookup = {};

        // Lookup from edge index => normals index
        var edgeLeftNormals = [];
        var edgeRightNormals = [];

        // Lookup from edge index => vertex index
        var edgeStarts = [];
        var edgeEnds = [];

        var edgeMatchTimer = stopwatch('Edge matching');
        var triA = mesh.triA, triB = mesh.triB, triC = mesh.triC;

        for (var i = 0; i < triA.length; i++) {
            registerClockwiseEdge(triA[i], triB[i], i);
            registerClockwiseEdge(triB[i], triC[i], i);
            registerClockwiseEdge(triC[i], triA[i], i);
        }

        // Reserve this array, hopefully
        edgeRightNormals.length = edgeLeftNormals.length;

        for (var i = 0; i < triA.length; i++) {
            registerCounterClockwiseEdge(triA[i], triB[i], i);
            registerCounterClockwiseEdge(triB[i], triC[i], i);
            registerCounterClockwiseEdge(triC[i], triA[i], i);
        }
        edgeMatchTimer.end();
        completedMesh.edgeStarts = edgeStarts;
        completedMesh.edgeEnds = edgeEnds;
        completedMesh.edgeLeftNormals = edgeLeftNormals;
        completedMesh.edgeRightNormals = edgeRightNormals;
        return completedMesh;
    }

    function wrapMesh(mesh) {
        function dot(normalIndexA, normalIndexB) {
            var ax = mesh.normalsX[normalIndexA];
            var ay = mesh.normalsY[normalIndexA];
            var az = mesh.normalsZ[normalIndexA];
            var bx = mesh.normalsX[normalIndexB];
            var by = mesh.normalsY[normalIndexB];
            var bz = mesh.normalsZ[normalIndexB];
            return ax * bx + ay * by + az * bz;
        }

        return {
            mesh: mesh,
            dotNormals: dot
        };
    }

    function parseBinarySTL(stlData) {
        var timer = stopwatch('Parse binary STL');

        // 80 bytes of header before triangle count
        var dataView = new DataView(stlData, 80);

        // This is the number of triangles
        var count = dataView.getInt32(0, true);

        var ax = 0, ay = 0, az = 0;
        var bx = 0, by = 0, bz = 0;
        var cx = 0, cy = 0, cz = 0;

        var vertexLookup = {};

        var coordX = [], coordY = [], coordZ = [];
        var triA = [], triB = [], triC = [];
        var normalsX = [], normalsY = [], normalsZ = [];

        for (var i = 0; i < count; i++) {
            // triangle count (4) + normals (3x4) + prior triangles (50 each with attribute values)
            var offset = 4 + 12 + (i * 50);
            var ax = dataView.getFloat32(offset + 4 * 0, true), ay = dataView.getFloat32(offset + 4 * 1, true), az = dataView.getFloat32(offset + 4 * 2, true);
            var bx = dataView.getFloat32(offset + 4 * 3, true), by = dataView.getFloat32(offset + 4 * 4, true), bz = dataView.getFloat32(offset + 4 * 5, true);
            var cx = dataView.getFloat32(offset + 4 * 6, true), cy = dataView.getFloat32(offset + 4 * 7, true), cz = dataView.getFloat32(offset + 4 * 8, true);

            var a_str = ax + '|' + ay + '|' + az;
            var b_str = bx + '|' + by + '|' + bz;
            var c_str = cx + '|' + cy + '|' + cz;
            var ai = vertexLookup[a_str], bi = vertexLookup[b_str], ci = vertexLookup[c_str];
            if (ai === undefined) {
                ai = vertexLookup[a_str] = coordX.length;
                coordX.push(ax);
                coordY.push(ay);
                coordZ.push(az);
            }
            if (bi === undefined) {
                bi = vertexLookup[b_str] = coordX.length;
                coordX.push(bx);
                coordY.push(by);
                coordZ.push(bz);
            }
            if (ci === undefined) {
                ci = vertexLookup[c_str] = coordX.length;
                coordX.push(cx);
                coordY.push(cy);
                coordZ.push(cz);
            }
            triA.push(ai);
            triB.push(bi);
            triC.push(ci);

            // Calculate the normal
            // http://math.stackexchange.com/questions/305642/how-to-find-surface-normal-of-a-triangle
            var nx = (by - ay) * (cz - az) - (cy - ay) * (bz - az);
            var ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            var nz = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);

            // Normalize
            var nd = Math.sqrt(nx * nx + ny * ny + nz * nz);
            normalsX.push(nx / nd);
            normalsY.push(ny / nd);
            normalsZ.push(nz / nd);
        }

        timer.end();
        return matchEdges({
            coordX: coordX, coordY: coordY, coordZ: coordZ,
            normalsX: normalsX, normalsY: normalsY, normalsZ: normalsZ,
            triA: triA, triB: triB, triC: triC
        });
    }
    STL.parseBinarySTL = parseBinarySTL;

    function readStringFromArrayBuffer(arrayBuffer, result) {
        var reader = new FileReader();
        reader.onload = function (event) {
            result(event.target.result);
        };
        reader.readAsText(new Blob([arrayBuffer], { type: 'application/octet-stream' }));
    }

    function bufferContainsString(uintView, str, limit) {
        var max = Math.min(limit, uintView.length) - str.length;
        for (var start = 0; start < max; start++) {
            var foundIt = true;
            for (var i = 0; i < str.length; i++) {
                if (uintView[start + i] !== str.charCodeAt(i)) {
                    foundIt = false;
                    break;
                }
            }
            if (foundIt)
                return true;
        }
        return false;
    }

    function downloadSTL(url, result) {
        downloadFile(url, function (arr) {
            return parseSTL(arr, result);
        });
    }
    STL.downloadSTL = downloadSTL;

    function parseSTL(array, result) {
        // Binary and Text STL files seem to be aggressively uncooperative:
        //  - Some binary STL files start with "solid"
        //  - Some text STL files start with a space
        //  - Some text STL files have a word after 'solid', some don't
        // ... so just look for "facet normal" starting after the 80 byte binary header,
        // which puts us into the binary portion of binary STL files but
        // should be found in a text STL file pretty quickly
        var view = new Uint8Array(array, 80);
        if (bufferContainsString(view, 'facet normal', 500)) {
            readStringFromArrayBuffer(array, function (str) {
                return result(parseTextSTL(str));
            });
        } else {
            result(parseBinarySTL(array));
        }
    }
    STL.parseSTL = parseSTL;
})(STL || (STL = {}));
//# sourceMappingURL=stlParsing.js.map
