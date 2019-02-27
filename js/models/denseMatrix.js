'use strict';
var _ = require('../underscore_ext');
var Rx = require('../rx');
var {map, find} = _;
var xenaQuery = require('../xenaQuery');
var heatmapColors = require('../heatmapColors');
var widgets = require('../columnWidgets');
var {greyHEX} = require('../color_helper');
var parsePos = require('../parsePos');
var exonLayout = require('../exonLayout');

var {datasetChromProbeValues, datasetProbeValues, datasetGeneProbeAvg,
	datasetGeneProbesValues, fieldCodes, refGeneRange} = xenaQuery;

function second(x, y) {
	return y;
}

function saveMissing(fn) {
	return function (v) {
		return v == null ? v : fn(v);
	};
}

/*
// Decide whether to normalize, perfering the user setting to the
// dataset default setting.
function shouldNormalize(vizSettings, defaultNormalization) {
	var user = _.getIn(vizSettings, ['colnormalization']);
	return user === 'subset' || (user == null && defaultNormalization === true);
}

function subbykey(subtrahend, key, val) {
	return val - subtrahend[key];
}
*/

// Returns 2d array of numbers, probes X samples.
// [[number, ...], [number, ...]]
// Performs sorting and normalization.
function computeHeatmap(vizSettings, data, fields, samples) {
	if (!data) {
		return [];
	}
	var {probes, values} = data,
		transform = second;
	//transform = (colnormalization && mean && _.partial(subbykey, mean)) || second;

	return map(probes || fields, function (p, i) {
		var suTrans = saveMissing(v => transform(i, v));
		return map(samples, s => suTrans(_.getIn(values, [i, s])));
	});
}

// sorted by start of probe in transcript direction (strand), for negative strand, the start of the probe is chromend
// known issue: tie break
var flopIfNegStrand = (strand, req) => {
	var sortedReq = _.sortBy(_.zip(req.position, req.probes, req.values),
		strand === '-' ? item => -(item[0].chromend) : item => item[0].chromstart),
		[sortedPosition, sortedProbes, sortedValues] = _.unzip(sortedReq);
	return _.assoc(req,
		'position', sortedPosition,
		'probes', sortedProbes,
		'values', sortedValues);
};

var colorCodeMap = (codes, colors) =>
	colors ? _.map(codes, c => colors[c] || greyHEX) : null;

var getCustomColor = (fieldSpecs, fields, dataset) =>
	fields.length === 1 ?
		_.getIn(dataset, ['customcolor', fieldSpecs[0].fields[0]], null) : null;

var defaultXZoom = (pos, refGene, position, showPos, values) =>
	!showPos ? {start: 0, end: values.length} :
		pos ? {
				start: pos.baseStart,
				end: pos.baseEnd} :
			!refGene ? undefined :
				_.Let(({txStart, txEnd} = refGene) => ({
					start: Math.min(txStart, ..._.pluck(position, 'chromstart')),
					end: Math.max(txEnd, ..._.pluck(position, 'chromend'))}));

var supportsClustering = ({fieldType, fields}) =>
	_.contains(['genes', 'probes'], fieldType) && fields.length > 2 ||
	fieldType === 'geneProbes';

function reOrderFields(column, data) {
	var probeOrder = _.getIn(data, ['clustering', 'probes']);
	if (supportsClustering(column) && column.clustering === 'probes' &&
		data.status !== 'loading' && probeOrder && data.req) {
		return {
			data: _.updateIn(data, ['req'], req => {
				var {mean, position, probes, values} = req;
				return _.merge(req,
					mean ? {mean: probeOrder.map(i => mean[i])} : {},
					position ? {position: probeOrder.map(i => position[i])} : {},
					probes ? {probes: probeOrder.map(i => probes[i])} : {},
					values ? {values: probeOrder.map(i => values[i])} : {});
			}),
			column: column.fieldType === 'geneProbes' ? column :
				_.assoc(column, 'fields', probeOrder.map(i => column.fields[i]))
		};
	}
	return {column, data};
}

var reorderFieldsTransform = fn =>
	(column0, vizSettings, data0, samples) =>
		_.Let(({column, data} = reOrderFields(column0, data0)) =>
			fn(column, vizSettings, data, samples));

var showPosition = column =>
	_.getIn(column, ['dataset', 'probemapMeta', 'dataSubType']) !== 'regulon';

function dataToHeatmap(column, vizSettings, data, samples) {
	if (!_.get(data, 'req')) {
		return null;
	}
	var {req, codes = {}} = data,
		{dataset, fieldSpecs} = column,
		fields = _.get(req, 'probes', column.fields),
		heatmap = computeHeatmap(vizSettings, req, fields, samples),
		customColors = colorCodeMap(codes, getCustomColor(fieldSpecs, fields, dataset)),
		assembly = _.getIn(dataset, ['probemapMeta', 'assembly']),
		colors = map(fields, (p, i) =>
			heatmapColors.colorSpec(column, vizSettings, codes,
				{'values': heatmap[i], 'mean': req.mean ? req.mean[i] : undefined},
				customColors)),
		units = [_.get(dataset, 'unit')];

	// column.fields is overwritten by this, which is problematic. It was
	// supposed to simplify the rendering layer by resolving whether the
	// field id maps to multiple probes, but we need the original field list
	// in the rendering layer, to determine if we support KM and gene average.
	// We could compute this in a selector, perhaps.
	return {fields, fieldList: column.fields, heatmap, assembly, colors, units};
}

function geneProbesToHeatmap(column, vizSettings, data, samples) {
	var pos = parsePos(column.fields[0]);
	if (_.isEmpty(data) || _.isEmpty(data.req) || !data.refGene) {
		return null;
	}
	if (!pos && _.isEmpty(data.refGene)) {
		// got refGene, but it's empty.
		return dataToHeatmap(column, vizSettings, data, samples);
	}
	var showPos = showPosition(column),
		{req} = data,
		{values} = req,
		refGeneObj = _.first(_.values(data.refGene)),
		maxChromXZoom = defaultXZoom(pos, refGeneObj, req.position, showPos, values),
		{width, showIntrons = false, xzoom} = column,
		// Use maxXZoom when there is no gene model (as xzoom is subcolumn indices)
		chromXZoom = showPos ? (xzoom || maxChromXZoom) : maxChromXZoom,
		createLayout = pos ? exonLayout.chromLayout : (showIntrons ? exonLayout.intronLayout : exonLayout.layout),
		// XXX Build layout that includes pxs for introns
		layout = createLayout(refGeneObj, width, chromXZoom, pos),
		probesInView, reqInView, heatmapData;

	if ( showPos ) {
		// put exons in an index. Look up via layout. What about
		// probes in introns? We can look them up as the "between" positions
		// of the layout.
		probesInView = _.filterIndices(req.position,
			({chromstart, chromend}) => chromXZoom.start <= chromend && chromstart <= chromXZoom.end);
	}
	else {
		var position = req.position,
			{start = 0, end = position.length} = xzoom || {};
		probesInView = _.filterIndices(position, (p, i) => i >= start && i <= end);
	}

	reqInView = _.updateIn(req,
		['values'], values => probesInView.map(i => values[i]),
		['probes'], probes => probesInView.map(i => probes[i]),
		['mean'], mean => probesInView.map(i => mean[i]));
	heatmapData = dataToHeatmap(column, vizSettings, {req: reqInView}, samples);

	return {
		...(probesInView.length ? heatmapData : {}),
		layout,
		position: probesInView.map(i => req.position[i]),
		maxXZoom: maxChromXZoom
	};
}

function zoomableDataToHeatmap(column, vizSettings, data, samples) {
	if (!_.get(data, 'req')) {
		return null;
	}
	var {req} = data,
		{values, position} = req,
		{xzoom = {}, fields} = column,
		maxXZoomStart = 0, // use 0 index here as we are dealing with an array of subcolumns
		maxXZoomEnd = values.length - 1,
		{start = maxXZoomStart, end = maxXZoomEnd} = xzoom,
		endIndex = end + 1,
		valuesInView = values.slice(start, endIndex),
		positionInView = position.slice(start, endIndex),
		reqInView = _.updateIn(req,
			['values'], () => valuesInView,
			['mean'], mean => _.range(start, endIndex).map(i => mean[i]),
			['position'], () => positionInView),
		// Update set of fields to just the fields in the current x zoom range
		zoomedColumn = Object.assign({}, column, {
			fields: fields.slice(start, endIndex)
		}),
		heatmap = {
			...dataToHeatmap(zoomedColumn, vizSettings, {req: reqInView}, samples),
			maxXZoom: {start: maxXZoomStart, end: maxXZoomEnd},
			fieldList: fields // Set field list to complete (max zoom) set of fields
		};

	return heatmap;
}

//
// sort
//

var {cmpNumberOrNull} = _;

function cmpSamples(probes, data, s1, s2) {
	var diff = data && find(data, function (f) {
		return cmpNumberOrNull(f[s1], f[s2]);
	});
	if (diff) {
		return cmpNumberOrNull(diff[s1], diff[s2]);
	} else {
		return 0;
	}
}

var cmp = ({fields}, {req: {values, probes} = {values, probes}} = {}) =>
	(s1, s2) => cmpSamples(probes || fields, values, s1, s2); // XXX having probes here is unfortunate.

//
// data fetches
//

// Convert nanstr and compute mean.
function meanNanResponse(probes, data) {
	var values = _.map(data, field => _.map(field, xenaQuery.nanstr)),
		mean = _.map(data, _.meannull);

	return {values, mean};
}

function indexProbeGeneResponse(data) {
	var [{name, position}, vals] = data;
	return _.extend({probes: name, position}, meanNanResponse(name, vals));
}

function fillNulls(samples, data) {
	return _.map(data, geneData =>
		geneData.length === 0 ?
			_.times(samples.length, _.constant(null)) : geneData);
}

function orderByQuery(genes, data) {
	var indx = _.invert(_.pluck(data, 'gene'));
	return _.map(genes, function (g) {
		var i = indx[g];
		return i && data[i].scores[0]; // XXX extra level of array in g.SCORES??
	});
}

function probeSpan({position}) {
	return position.length > 0 ? {
		chromend: _.max(_.pluck(position, 'chromend')),
		chromstart: _.min(_.pluck(position, 'chromstart')),
		strand: position[0].strand,
		chrom: position[0].chrom
	} : null;
}

function indexGeneResponse(samples, genes, data) {
	return {
		position: data.map(probeSpan),
		...meanNanResponse(genes, fillNulls(samples, orderByQuery(genes, data)))
	};
}

function indexFieldResponse(fields, resp) {
	var [namePos, data] = resp;
	return {
		position: namePos &&
			_.Let(({name, position} = namePos, posMap = _.object(name, position)) =>
				fields.map(f => posMap[f])),
		...meanNanResponse(fields, data)
	};
}

var fetch = ({dsID, fields}, samples) => datasetProbeValues(dsID, samples, fields)
	.map(resp => ({req: indexFieldResponse(fields, resp)}));

var fetchRefGene = (fields, assembly) => {
	var {name, host} = xenaQuery.refGene[assembly] || {};

	return name ?
		xenaQuery.refGeneExons(host, name, fields) :
		Rx.Observable.of(null, Rx.Scheduler.asap);
};

function fetchChromProbes({dsID, assembly, fields}, samples) {
	var {name, host} = xenaQuery.refGene[assembly] || {},
		pos = parsePos(fields[0]);
	return Rx.Observable.zip(
		refGeneRange(host, name, pos.chrom, pos.baseStart, pos.baseEnd),
		datasetChromProbeValues(dsID, samples, pos.chrom, pos.baseStart, pos.baseEnd),
		(refGene, resp) => ({
			req: indexProbeGeneResponse(resp),
			refGene}));
}

var fetchGeneProbes = ({dsID, fields, assembly}, samples) =>
	Rx.Observable.zip(
		fetchRefGene(fields, assembly),
		datasetGeneProbesValues(dsID, samples, fields),
		(refGene, resp) => ({
			req: flopIfNegStrand(_.getIn(refGene, [fields[0], 'strand']), indexProbeGeneResponse(resp)),
			refGene}));

var fetchGeneOrChromProbes = (field, samples) =>
	(parsePos(field.fields[0]) ? fetchChromProbes : fetchGeneProbes)(field, samples);

// This should really be fetchCoded. Further, it should only return a single
// code list, i.e. either a single clinical coded field, or a list of genomic
// fields all with the same code values.
var fetchFeature = ({dsID, fields}, samples) => Rx.Observable.zipArray(
	datasetProbeValues(dsID, samples, fields)
		.map(resp => indexFieldResponse(fields, resp)),
	fieldCodes(dsID, fields)
).map(([req, codes]) => ({req, codes: _.values(codes)[0]}));

var fetchGene = ({dsID, fields}, samples) => datasetGeneProbeAvg(dsID, samples, fields)
	.map(resp => ({req: indexGeneResponse(samples, fields, resp)}));

////////////////////////////////
// download of on-screen data

function tsvProbeMatrix(heatmap, samples, fields, codes) {
	var fieldNames = ['sample'].concat(fields);
	var coded = _.map(fields, (f, i) => codes ?
		_.map(heatmap[i], _.propertyOf(codes)) :
		heatmap[i]);
	var transposed = _.zip.apply(null, coded);
	var tsvData = _.map(samples, (sample, i) => [sample].concat(transposed[i]));

	return [fieldNames, tsvData];
}

function download({column, data, samples, sampleFormat}) {
	var {fields, heatmap} = column,
		tsvSamples = _.map(samples, sampleFormat);
	return tsvProbeMatrix(heatmap, tsvSamples, fields, data.codes);
}

function downloadCodedSampleListsJSON({data, samples, sampleFormat}) {
	//download json sample lists for coded column
	var values = _.getIn(data, ['req', 'values', 0]),
		codes = _.get(data, 'codes'),
		downloadData;

	if (codes.length === values.length) {
		downloadData = {
			"samples": codes
		};
	}
	else {
		var groupedSamples = _.groupBy(samples, sample => codes[values[sample]]);
		downloadData = _.mapObject(groupedSamples, val => val.map(sample => sampleFormat(sample)));
	}

	return {
		type: "json",
		downloadData: downloadData
	};
}

['probes', 'geneProbes', 'genes', 'clinical'].forEach(fieldType => {
	widgets.cmp.add(fieldType, cmp);
	widgets.download.add(fieldType, download);
});

widgets.transform.add('probes', reorderFieldsTransform(zoomableDataToHeatmap));
widgets.transform.add('geneProbes', reorderFieldsTransform(geneProbesToHeatmap));
widgets.transform.add('genes', reorderFieldsTransform(zoomableDataToHeatmap));
widgets.transform.add('clinical', reorderFieldsTransform(dataToHeatmap));

widgets.specialDownload.add('clinical', downloadCodedSampleListsJSON);

module.exports = {
	fetch,
	fetchGeneOrChromProbes,
	fetchGene,
	fetchFeature,
};
