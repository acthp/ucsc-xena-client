// Screen layout of exons for a single gene.

/*global require: false, module: false */
'use strict';

var spLen = 3; // size of intronic region to draw between exons

var _ = require('underscore');

// reverse layout if on negative strand.
var reverseIf = (strand, arr) =>
	(strand === '-') ? arr.slice(0).reverse() : arr;

//pad start of the arr interval, ignore strand
var padStart = (arr, padding) =>
	_.updateIn(arr, [0, 0], x => x - padding);

//pad end of the arr interval, ignore strand
var padEnd = (arr, padding) =>
	_.updateIn(arr, [arr.length - 1, 1], x => x + padding);

function pad1(p, intervals, acc) {
	if (intervals.length === 1) {
		return acc.concat(intervals);
	}
	var [[ls, le], [rs, re], ...rest] = intervals;
	return pad1(p, [[rs - p, re]].concat(rest), acc.concat([[ls, le + p]]));
}

// Extend exon intervals, to show splice sites.
// can drop this wrapper with babel, using param default acc=[], above.
var	pad = (p, intervals) => pad1(p, intervals, []);

// XXX This generates exon boundaries on pixel fractions. Might want to
// change it to integer pixels. Note that we can't round + continue the
// calculation because the rounding errors can sum to over a pixel length by
// the end. Instead, project all the lengths from zero & round to avoid
// rounding error accumulating at the end.

// Tail call version. Will be optimized when we switch to babel.
// Also, use defaults offset=0, acc=[]
function toScreen(bpp, [next, ...rest], offset, acc) {
	if (!next) {
		return acc;
	}
	var [start, end] = next,
		len = (end - start + 1) / bpp;
	return toScreen(bpp, rest, len + offset, acc.concat([[offset, len + offset]]));
}

function baseLen(chrlo) {
	return _.reduce(chrlo, (acc, [s, e]) => acc + e - s + 1, 0);
}

function pxLen(chrlo) {
	return _.reduce(chrlo, (acc, [s, e]) => acc + e - s, 0);
}

// Layout exons on screen pixels.
// layout(genepred :: {exonStarts : [<int>, ...], exonEnds: [<int>, ...], strand: <string>)
//  :: {chrom: [[<int>, <int>], ...], screen: [[<int>, <int>], ...], reversed: <boolean>}
// padding_TxStart: promoter region padding, padding=0 is just showing the gene
// padding_TxEnd: region after the last exon, padding=0 is just showing the gene
// startExonIndex, endExonIndex : used to specify which exon range to show 0,1 for first exon, 0, 2 for 1st and 2nd exon
function layout({exonStarts, exonEnds, strand}, pxWidth, zoom, paddingTxStart, paddingTxEnd, startExon, endExon) {
	var addedSpliceIntvls = pad(spLen, _.zip(exonStarts, exonEnds)),
		startPaddedIntvals = (strand === "+" ) ? padStart (addedSpliceIntvls, paddingTxStart)
			: padEnd (addedSpliceIntvls, paddingTxStart),
		endPaddedIntvals = (strand === "+") ? padEnd (startPaddedIntvals, paddingTxEnd)
			: padStart (startPaddedIntvals, paddingTxEnd),
		chrIntvls = reverseIf(strand, endPaddedIntvals).slice(startExon, endExon),
		count = _.getIn(zoom, ['len'], baseLen(chrIntvls)),
		bpp = count / pxWidth,
		pixIntvls = toScreen(bpp, chrIntvls, 0, []);

	return {
		chrom: chrIntvls,
		screen: pixIntvls,
		reversed: strand === '-',
		baseLen: count,
		pxLen: pxWidth,
		zoom: zoom
	};
}

function intronLayout({txStart, txEnd, strand}, pxWidth, zoom) {
	var chrIntvls = reverseIf(strand, [[txStart, txEnd]]),
		count = _.getIn(zoom, ['len'], baseLen(chrIntvls)),
		bpp = count / pxWidth,
		pixIntvls = toScreen(bpp, chrIntvls, 0, []);

	return {
		chrom: chrIntvls,
		screen: pixIntvls,
		reversed: strand === '-',
		baseLen: count,
		pxLen: pxWidth,
		zoom: zoom
	};
}

module.exports = {
	intronLayout,
	screenLayout: (bpp, chrlo) => toScreen(bpp, chrlo, 0, []),
	baseLen: baseLen,
	pxLen: pxLen,
	layout: layout,
	pad: pad
};
