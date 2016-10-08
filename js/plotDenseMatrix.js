/*global require: false, module: false */
'use strict';

var _ = require('./underscore_ext');
var Rx = require('rx');
var widgets = require('./columnWidgets');
var colorScales = require('./colorScales');
var util = require('./util');
var Legend = require('./views/Legend');
var React = require('react');
var CanvasDrawing = require('./CanvasDrawing');
var {deepPureRenderMixin, rxEventsMixin} = require('./react-utils');
var drawHeatmap = require('./drawHeatmap');
var {greyHEX} = require ('./color_helper');

// Since we don't set module.exports, but instead register ourselves
// with columWidgets, react-hot-loader can't handle the updates automatically.
// Accept hot loading here.
if (module.hot) {
	module.hot.accept();
}

// Since there are multiple components in the file we have to use makeHot
// explicitly.
function hotOrNot(component) {
	return module.makeHot ? module.makeHot(component) : component;
}

var map = _.map,
	filter = _.filter,
	zip = _.zip,
	range = _.range,
	uniq = _.uniq;

var secondExists = x => x[1] != null;

var colorFns = (vs, customCategoryMore) => _.map(vs, args => {
	return colorScales.colorScale (args, customCategoryMore);
});

//
// Tooltip
//

var prec = (function () {
	var precision = 6,
		factor = Math.pow(10, precision);
	return val => (val == null) ? 'NA' : Math.round((val * factor)) / factor;
}());

// We're getting events with coords < 0. Not sure if this
// is a side-effect of the react event system. This will
// restrict values to the given range.
function bounded(min, max, x) {
	return x < min ? min : (x > max ? max : x);
}

var nn = (...args) => args.filter(x => x); // not "falsey" (null, undefined, false, etc.)

function tooltip(heatmap, fields, sampleFormat, fieldFormat, codes, width, zoom, samples, ev) {
	var coord = util.eventOffset(ev),
		sampleIndex = bounded(0, samples.length, Math.floor((coord.y * zoom.count / zoom.height) + zoom.index)),
		sampleID = samples[sampleIndex],
		fieldIndex = bounded(0, fields.length, Math.floor(coord.x * fields.length / width)),
		field = fields[fieldIndex];

	var val = _.getIn(heatmap, [fieldIndex, sampleIndex]),
		code = _.get(codes, val),
		label = fieldFormat(field);

	val = code ? code : prec(val);

	return {
		sampleID: sampleFormat(sampleID),
		rows: nn(
			[['labelValue', label, val]],
			(val !== 'NA' && !code) &&
				[['labelValue', 'Column mean', prec(_.meannull(heatmap[fieldIndex]))]])
	};
}

//
// Legends
//

// XXX missing data handled incorrectly on reload? Is this because NaN is miscoded in json?
function categoryLegend(dataIn, colorScale, codes) {
	if (!colorScale) {
		return {colors: [], labels: [], align: 'left'};
	}
	// only finds categories for the current data in the column
	var data = _.reject(uniq(dataIn), x => x == null).sort((v1, v2) =>  v1 - v2),
		// zip colors and their indexes, then filter out the nulls
		colors = _.map(filter(zip(range(data.length), map(data, colorScale)), secondExists),
				c => c[1]),
		labels = map(data, d => codes[d]);
	return {colors: colors, labels: labels, align: 'left'};
}

// Color scale cases
// Use the domain of the scale as the label.
// If using thresholded scales, add '<' '>' to labels.

var cases = ([tag], arg, c) => c[tag](arg);

function legendForColorscale(colorSpec) {
	var scale = colorScales.colorScale(colorSpec, null),
		values = scale.domain(),
		colors = _.map(values, scale);

	var labels = cases(colorSpec, values, {
		'no-data': () => [],
		'float': _.identity,
		'float-pos': _.identity,
		'float-neg': _.identity,
		'float-thresh': ([nl, nh, pl, ph]) => [nl, nh, pl, ph],
		'float-thresh-pos': ([low, high]) => [low, high],
		'float-thresh-neg': ([low, high]) => [low, high]
	});

	return {colors, labels};
}

// We never want to draw multiple legends. We only draw the 1st scale
// passed in. The caller should provide labels/colors in the 'legend' prop
// if there are multiple scales.
function renderFloatLegend(props) {
	var {colors, vizSettings, defaultNormalization, datasetMetadata, data} = props,
		hasData = _.getIn(colors, [0]);

	var {labels, colors: legendColors} = hasData ? legendForColorscale(colors[0]) :
		{colors: [], labels: []},
		footnotes = [],
		nSamples = (data && data.length) ? data[0].filter(v => v != null).length : 0,
		normalizationText = "mean is subtracted per column across " + nSamples + " samples",
		hasViz = vizSettings => !isNaN(_.getIn(vizSettings, ['min'])),
		multiScaled = colors && colors.length > 1 && !hasViz(vizSettings);

	if (multiScaled) {
		labels = labels.map((label, i) => {
			if (i === 0) {return "lower";}
			else if(i === labels.length - 1) {return "higher";}
			else {return "";}
		});
	}

	if (datasetMetadata) {
		footnotes = _.map(datasetMetadata, metadata =>{
			return metadata.unit;
		});
	}

	if (vizSettings &&  vizSettings.colNormalization) {
		if (vizSettings.colNormalization === "subset") { // substract mean per subcolumn
			footnotes.push(normalizationText);
		}
	} else if (defaultNormalization) {
		footnotes.push(normalizationText);
	}

	return <Legend colors={legendColors} labels={labels} footnotes={footnotes}/>;
}

// Might have colorScale but no data (phenotype), no data & no colorScale,
// or data & colorScale, no colorScale &  data?
function renderCodedLegend(props) {
	var {data: [data] = [], codes, colors = [], customColor} = props;
	var legendProps;
	var customCategoryMore;

	if (customColor) {
		customCategoryMore = _.map(codes, s => customColor[s] || greyHEX);
	}

	var colorfn = _.first(colorFns(colors.slice(0, 1), customCategoryMore));

	// We can use domain() for categorical, but we want to filter out
	// values not in the plot. Also, we build the categorical from all
	// values in the db (even those not in the plot) so that colors will
	// match in other datasets.
	if (data && colorfn) { // category
		legendProps = categoryLegend(data, colorfn, codes);
	} else {
		return <span />;
	}

	return <Legend {...legendProps} />;
}

var HeatmapLegend = hotOrNot(React.createClass({
	mixins: [deepPureRenderMixin],
	render: function() {
		var {column, data} = this.props,
			{heatmap, colors, legend, valueType, vizSettings, defaultNormalization, datasetMetadata} = column,
			fields = _.get (column, 'fields'),
			cohortNumber = fields.length,
			customColor = (cohortNumber === 1) ? _.getIn(column, ['datasetMetadata', 0, 'customcolor', fields[0]])
				: null,
			props = {
				colors,
				legend,
				vizSettings,
				defaultNormalization,
				datasetMetadata,
				data: heatmap,
				coded: valueType === 'coded',
				codes: _.get(data, 'codes'),
				customColor: customColor
			};
		return (props.coded ? renderCodedLegend : renderFloatLegend)(props);
	}
}));

//
// plot rendering
//

function tsvProbeMatrix(heatmap, samples, fields, codes) {
	var fieldNames = ['sample'].concat(fields);
	var coded = _.map(fields, (f, i) => codes ?
			_.map(heatmap[i], _.propertyOf(codes)) :
			heatmap[i]);
	var transposed = _.zip.apply(null, coded);
	var tsvData = _.map(samples, (sample, i) => [sample].concat(transposed[i]));

// XXX
//	if (this.ws.column.dataType === 'clinicalMatrix') {
//		fieldNames = ['sample'].concat([this.ws.column.fieldLabel.default]);
//	}
	return [fieldNames, tsvData];
}

var HeatmapColumn = hotOrNot(React.createClass({
	mixins: [rxEventsMixin, deepPureRenderMixin],
	componentWillMount: function () {
		this.events('mouseout', 'mousemove', 'mouseover');

		// Compute tooltip events from mouse events.
		this.ttevents = this.ev.mouseover.filter(ev => util.hasClass(ev.currentTarget, 'Tooltip-target'))
			.selectMany(() => {
				return this.ev.mousemove
					.takeUntil(this.ev.mouseout)
					.map(ev => ({
						data: this.tooltip(ev),
						open: true,
						point: {x: ev.clientX, y: ev.clientY}
					})) // look up current data
					.concat(Rx.Observable.return({open: false}));
			}).subscribe(this.props.tooltip);
	},
	componentWillUnmount: function () {
		this.ttevents.dispose();
	},
	tooltip: function (ev) {
		var {samples, data, column, zoom, sampleFormat, fieldFormat, id} = this.props,
			codes = _.get(data, 'codes'),
			{fields, heatmap, width} = column;
		return tooltip(heatmap, fields, sampleFormat, fieldFormat(id), codes, width, zoom, samples, ev);
	},
	download: function () {
		var {samples, data, sampleFormat, column } = this.props,
			{fields, heatmap} = column,
			tsvSamples = _.map(samples, sampleFormat);
		return tsvProbeMatrix(heatmap, tsvSamples, fields, data.codes);
	},
	// To reduce this set of properties, we could
	//    - Drop data & move codes into the 'display' obj, outside of data
	// Might also want to copy fields into 'display', so we can drop req probes
	render: function () {
		var {data, column, zoom} = this.props,
			{heatmap, colors} = column,
			codes = _.get(data, 'codes'),
			fields = _.get (column, 'fields'),
			cohortNumber = fields.length,
			customColor = (cohortNumber === 1) ? _.getIn(column, ['datasetMetadata', 0, 'customcolor', fields[0]])
				: null;

		return (
			<CanvasDrawing
					ref='plot'
					draw={drawHeatmap}
					wrapperProps={{
						className: 'Tooltip-target',
						onMouseMove: this.ev.mousemove,
						onMouseOut: this.ev.mouseout,
						onMouseOver: this.ev.mouseover,
						onClick: this.props.onClick
					}}
					codes={codes}
					width={_.get(column, 'width')}
					zoom={zoom}
					colors={colors}
					customColor={customColor}
					heatmapData={heatmap}/>);
	}
}));

var getColumn = props => <HeatmapColumn {...props} />;

widgets.column.add("probes", getColumn);
widgets.column.add("geneProbes", getColumn);
widgets.column.add("genes", getColumn);
widgets.column.add("clinical", getColumn);

var getLegend = props => <HeatmapLegend {...props} />;

widgets.legend.add('probes', getLegend);
widgets.legend.add('geneProbes', getLegend);
widgets.legend.add('genes', getLegend);
widgets.legend.add('clinical', getLegend);
