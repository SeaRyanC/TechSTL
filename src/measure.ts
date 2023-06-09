﻿/// <reference path="stlParsing.ts" />
/// <reference path="knockout.d.ts" />

interface Point3d {
    x: number;
    y: number;
    z: number;
}

enum MeasureType {
    Linear,
    Diameter
}

interface LinearMeasure {
    /// Starting point of the line, expressed in world units
    start: Point3d;
    /// Ending point of the line, expressed in world units
    end: Point3d;
    /// How far away (in right-angle distance) the actual line should be shown
    offsetDistance: number;
    /// How close to 'start' the label should be (0.5 = centered, 0 = at start, 1 = at end)
    labelPositioning: number;
    /// What to display as the label
    text: string;
}

interface DiameterMeasure {
    /// Center of the diameter or arc, in world units
    center: Point3d;
    /// Diameter, in world units
    diameter: number;
    /// Angle of diameter indication line, in degrees
    diameterLineAngle?: number;
    /// Text to display
    text: string;
}

module Measure {
    var fontSize = 20;
    var arrowStyle = '#3366BB';
    var style = '#3366BB';
    var font = 'italic ' + fontSize + 'pt Consolas';
    var textPaddingHorizontal = fontSize / 4;
    var textPaddingVertical = fontSize / 4;

    module Default {
        export var arrowAngle = 35 * (Math.PI / 180);
        export var arrowSize = 9;
        export var backoff = 3;
    }

    interface ArrowedLineOptions {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        /// Specified in radians
        arrowAngle?: number;
        arrowSize?: number;
        backoff?: number;
    }

    function defaulted<T>(n: T, def: T): T {
        if (n === undefined) {
            return def;
        } else {
            return n;
        }
    }

    function renderArrowedLine(ctx: CanvasRenderingContext2D, opts: ArrowedLineOptions) {
        ctx.save();

        ctx.strokeStyle = arrowStyle;
        ctx.lineWidth = 1.5;

        var arrowAngle = defaulted(opts.arrowAngle, Default.arrowAngle);
        var arrowSize = defaulted(opts.arrowSize, Default.arrowSize);
        var backoff = defaulted(opts.backoff, Default.backoff);

        var x1 = opts.x1, x2 = opts.x2;
        var y1 = opts.y1, y2 = opts.y2;
        var lineAngle = Math.atan2(opts.y2 - opts.y1, opts.x2 - opts.x1);

        if (backoff > 0) {
            x1 += Math.cos(lineAngle) * backoff;
            y1 += Math.sin(lineAngle) * backoff;
            x2 -= Math.cos(lineAngle) * backoff;
            y2 -= Math.sin(lineAngle) * backoff;
        }

        // Main line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        function head(x: number, y: number, scale: number) {
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(lineAngle + arrowAngle) * scale, y + Math.sin(lineAngle + arrowAngle) * scale);
            ctx.lineTo(x, y);
            ctx.lineTo(x + Math.cos(lineAngle - arrowAngle) * scale, y + Math.sin(lineAngle - arrowAngle) * scale);
            ctx.stroke();
           
        }

        // First arrow head
        head(x1, y1, arrowSize);
        // Second arrow head
        head(x2, y2, -arrowSize);

        ctx.restore();
    }

    function renderText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, angle: number) {
        ctx.save();

        ctx.strokeStyle = '#DDD';
        ctx.lineWidth = 7;

        ctx.fillStyle = style;
        ctx.font = font;
        var textSize = ctx.measureText(text);
        ctx.textBaseline = 'middle';
        ctx.clearRect(
            x - textPaddingHorizontal - textSize.width / 2,
            y - fontSize / 2 - textPaddingVertical,
            textSize.width + textPaddingHorizontal * 2,
            fontSize + textPaddingVertical * 2);
        ctx.strokeText(text, x - textSize.width / 2, y);
        ctx.fillText(text, x - textSize.width / 2, y);

        ctx.restore();
    }

    export function renderDiameterMeasure(measure: DiameterMeasure, ctx: CanvasRenderingContext2D, camera: Geometry.OrthoCamera) {
        ctx.save();

        ctx.fillStyle = ctx.strokeStyle = style;

        var arrowSize = 14;
        var arrowAngle = Math.PI / 6;
        var pt = camera.worldToFilm(measure.center);
        var dia = camera.scale * measure.diameter;
        var circumference = dia * Math.PI;
        var dashes = Math.round(circumference / 8);

        // Draw the chord line
        var lineAngle = measure.diameterLineAngle || -Math.PI / 3;
        renderArrowedLine(ctx, {
            x1: Math.cos(lineAngle) * dia / 2 + pt.x,
            y1: Math.sin(lineAngle) * dia / 2 + pt.y,
            x2: Math.cos(lineAngle + Math.PI) * dia / 2 + pt.x,
            y2: Math.sin(lineAngle + Math.PI) * dia / 2 + pt.y
        });

        // Draw the text
        renderText(ctx, pt.x, pt.y, measure.text, 0);

        // Draw the circle
        ctx.setLineDash([circumference / dashes, circumference / dashes]);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, dia / 2, 0, Math.PI * 2, false);
        ctx.stroke();

        ctx.restore();
    }

    export function renderLinearMeasure(measure: LinearMeasure, ctx: CanvasRenderingContext2D, camera: SimpleOrthographicCamera) {
        ctx.save();

        var endcapSize = 8;
        ctx.lineWidth = 1.5;

        ctx.textBaseline = 'middle';
        ctx.font = font;

        var start = camera.worldToFilm(measure.start);
        var end = camera.worldToFilm(measure.end);
        var lineAngle = Math.atan2(end.y - start.y, end.x - start.x);
        var endcapAngle = lineAngle + (Math.PI / 2);

        var lineLength = Math.sqrt((start.x - end.x) * (start.x - end.x) + (start.y - end.y) * (start.y - end.y));
        var labelPointX = (start.x * measure.labelPositioning) + (end.x * (1 - measure.labelPositioning));
        var labelPointY = (start.y * measure.labelPositioning) + (end.y * (1 - measure.labelPositioning))

        // Measure line
        ctx.strokeStyle = style;
        renderArrowedLine(ctx, {
            x1: start.x, y1: start.y,
            x2: end.x, y2: end.y
        });

        // Text
        /*
        ctx.save();
        var textSize = ctx.measureText(measure.text);
        ctx.translate(start.x, start.y);
        ctx.rotate(lineAngle);
        ctx.translate(lineLength * measure.labelPositioning - textSize.width / 2, 0);
        // Clear out an area of the measure line behind the text
        // ctx.clearRect(-textPadding, -fontSize, textSize.width + textPadding * 2, fontSize * 2);
        ctx.fillStyle = style;
        ctx.fillText(measure.text, 0, 0);
        ctx.restore();
*/
        renderText(ctx, labelPointX, labelPointY, measure.text, 0);

        // Endcaps
        ctx.beginPath();
        ctx.moveTo(start.x - Math.cos(endcapAngle) * endcapSize, start.y - Math.sin(endcapAngle) * endcapSize);
        ctx.lineTo(start.x + Math.cos(endcapAngle) * endcapSize, start.y + Math.sin(endcapAngle) * endcapSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(end.x - Math.cos(endcapAngle) * endcapSize, end.y - Math.sin(endcapAngle) * endcapSize);
        ctx.lineTo(end.x + Math.cos(endcapAngle) * endcapSize, end.y + Math.sin(endcapAngle) * endcapSize);
        ctx.stroke();

        ctx.restore();
    }

}