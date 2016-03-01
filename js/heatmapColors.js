/*global require: false, module: false */
'use strict';

var d3 = require('d3-scale');
var _ = require('underscore');
var multi = require('multi');

var isNumber = _.isNumber,
	// d3_category20, replace #7f7f7f gray (that aliases with our N/A gray of #808080) with dark grey #434348
	categoryMore = [
		"#1f77b4", // dark blue
		"#aec7e8", // light blue
		"#2ca02c", // dark green
		"#98df8a", // light green
		"#d62728", // dark red
		"#ff9896", // light salmon
		"#ff7f0e", // dark orange
		"#ffbb78", // light orange
		"#9467bd", // dark purple
		"#c5b0d5", // light lavender
		"#8c564b", // dark brown
		"#c49c94", // light tan
		"#e377c2", // dark pink
		"#f7b6d2", // light pink
		"#bcbd22", // dark mustard
		"#dbdb8d", // light mustard
		"#17becf", // dark blue-green
		"#9edae5", // light blue-green
		"#434348", // very dark grey
		"#c7c7c7"  // light grey
	];

var defaultColors = (function () {
	var schemes = {
			blueWhiteRed: ['#0000ff', '#ffffff', '#ff0000'],
			greenBlackRed: ['#00ff00', '#000000', '#ff0000'],
			greenWhiteRed: ['#00ff00', '#ffffff', '#ff0000'],
			greenBlackYellow: ['#007f00', '#000000', '#ffff00']
			/* with clinical category palette:
			blueWhiteRed: ['#377eb8', '#ffffff', '#e41a1c'],
			greenBlackRed: ['#4daf4a', '#000000', '#e41a1c'],
			greenBlackYellow: ['#4daf4a', '#000000', '#ffff33']
			*/
		},

		defaults = {
			"gene expression": schemes.greenBlackRed,
			"gene expression RNAseq": schemes.greenBlackRed,
			"gene expression array": schemes.greenBlackRed,
			"exon expression RNAseq": schemes.greenBlackRed,
			"phenotype": schemes.greenBlackYellow
		};


	// XXX it's rather broken that these conditionals appear here, in
	// addition to in the colorRange multi
	return function (dataset) {
		var {type, dataSubType} = dataset || {};
		var t = (type === 'clinicalMatrix') ?  'phenotype' : dataSubType;
		return defaults[t] || schemes.blueWhiteRed;
	};
}());

// Return a new function that preserves undefined arguments, otherwise calls the original function.
// This is to work-around d3 scales.
function saveMissing(fn) {
	var newfn = function (v) {
		return v == null ? v : fn(v);
	};
	return _.extend(newfn, fn); // This weirdness copies d3 fn methods
}

var ordinal = count => d3.scaleOrdinal().range(categoryMore).domain(_.range(count));

// 'column' is the column type set by the UI. It's not the dataset metadata.
// It is *based on* the dataset metadata. We use it to decide whether to
// use clinical vs. genomic scaling for floats.
// 'settings' is the vizSettings: user override of min/max, etc.
// 'codes' is also used to pick categorical.
// 'data' is used to find min/max.
//
//  Of these, we can't drop 'data' or 'codes'.
//  Perhaps we should just pass in column.dataType and dataSubType, since we don't
//  need all the other params.
function colorRangeType(column, settings, codes) {
	return codes ? 'coded' :
		(column.dataType === 'clinicalMatrix' ? 'float' : 'floatGenomicData');
}

var colorRange = multi(colorRangeType);

var scaleFloatSingle = (low, high, min, max) =>
	d3.scaleLinear().domain([min, max]).range([low, high]);

function scaleFloatDouble(low, zero, high, min, max) {
	var absmax = Math.max(-min, max);

	return d3.scaleLinear()
		.domain([-absmax, 0, absmax])
		.range([low, zero, high]);
}

function colorFloat(column, settings, codes, data, dataset) {
	var values = data,
		max = _.max(values),
		[low, zero, high] = defaultColors(dataset),
		spec,
		min;

	if (!isNumber(max)) {
		return ['no-data'];
	}
	min = _.min(values);
	if (min >= 0 && max >= 0) {
		spec = ['float-pos', zero, high, min, max];
	} else if (min <= 0 && max <= 0) {
		spec = ['float-neg', low, zero, min, max];
	} else {
		spec = ['float', low, zero, high, min, max];
	}
	return spec;
}

function colorCoded(column, settings, codes) {
	return ['ordinal', codes.length];
}

var scaleFloatThresholdNegative = (low, zero, min, thresh, max) =>
	d3.scaleLinear()
		.domain(_.map([min, thresh, max], x => x.toPrecision(2)))
		.range([low, zero, zero]);

var scaleFloatThresholdPositive = (zero, high, min, thresh, max) =>
	d3.scaleLinear()
		.domain(_.map([min, thresh, max], x => x.toPrecision(2)))
		.range([zero, zero, high]);

var scaleFloatThreshold = (low, zero, high, min, minThresh, maxThresh, max) =>
	d3.scaleLinear()
		.domain(_.map([min, minThresh, maxThresh, max], x => x.toPrecision(2)))
		.range([low, zero, zero, high]);

function colorFloatGenomicData(column, settings = {}, codes, data, dataset) {
	var values = data,
		[low, zero, high] = defaultColors(dataset),
		min = settings.min || _.min(values),
		max = settings.max ||  _.max(values),
		minStart = settings.minStart,
		maxStart = settings.maxStart,
		spec,
		mid,
		absmax,
		zone;

	if (!isNumber(max) || !isNumber(min)) {
		return ['no-data'];
	}

	if ((settings.min !== undefined) && (settings.min !== null) && !isNaN(settings.min)) { //custom setting
		if (isNaN(minStart)  || isNaN(maxStart) || (minStart === null) || (maxStart === null)) {
			mid = (max + min) / 2.0;
			zone = (max - min) / 4.0;
			minStart = mid  -  zone / 2.0;
			maxStart = mid  +  zone / 2.0;
		}
		spec = ['float-thresh', low, zero, high, min, minStart, maxStart, max];
	} else if (min < 0 && max > 0) {
		absmax = Math.max(-min, max);
		zone = absmax / 4.0;
		spec = ['float-thresh', low, zero, high, -absmax / 2.0, -zone / 2.0,
			 zone / 2.0, absmax / 2.0];
	} else	if (min >= 0 && max >= 0) {
		zone = (max - min) / 4.0;
		spec = ['float-thresh-pos', zero, high, min, min + zone, max - zone / 2.0];
	} else { // min <= 0 && max <= 0
		zone = (max - min) / 4.0;
		spec = ['float-thresh-neg', low, zero, min + zone / 2.0, max - zone, max];
	}
	return spec;
}

colorRange.add('float', colorFloat);
colorRange.add('coded', colorCoded);
colorRange.add('floatGenomicData', colorFloatGenomicData);

// A scale for when we have no data. Implements the scale API
// so we don't have to put a bunch of special cases in the drawing code.
var noDataScale = () => "gray";
noDataScale.domain = () => [];

var colorScale = {
	'no-data': () => noDataScale,
	'float-pos': (__, ...args) => scaleFloatSingle(...args),
	'float-neg': (__, ...args) => scaleFloatSingle(...args),
	'float': (__, ...args) => scaleFloatDouble(...args),
	'float-thresh-pos': (__, ...args) => scaleFloatThresholdPositive(...args),
	'float-thresh-neg': (__, ...args) => scaleFloatThresholdNegative(...args),
	'float-thresh': (__, ...args) => scaleFloatThreshold(...args),
	'ordinal': (__, count) => ordinal(count)
};

module.exports =  {
	colorScale: ([type, ...args]) => saveMissing(colorScale[type](type, ...args)),
	colorSpec: colorRange,
	defaultColors: defaultColors,
	categoryMore: categoryMore
};
