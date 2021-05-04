import PureComponent from '../PureComponent';
var util = require('../util').default;
var React = require('react');
var _ = require('../underscore_ext').default;
var DefaultTextInput = require('./DefaultTextInput');
var DragSelect = require('./DragSelect');
var SpreadSheetHighlight = require('../SpreadSheetHighlight');
var ResizeOverlay = require('./ResizeOverlay');
var widgets = require('../columnWidgets');
var columnZoom = require('../columnZoom');
var aboutDatasetMenu = require('./aboutDatasetMenu');
import spinner from '../ajax-loader.gif';
var mutationVector = require('../models/mutationVector');
//var ValidatedInput = require('./ValidatedInput');
var konami = require('../konami');
var Crosshair = require('./Crosshair');
var parsePos = require('../parsePos');
var {categoryMore} = require('../colorScales');
var {publicServers} = require('../defaultServers');
import {IconMenu as RTIconMenu, MenuItem, MenuDivider} from 'react-toolbox/lib/menu';
import Tooltip from 'react-toolbox/lib/tooltip';
var ColCard = require('./ColCard');
var {ChromPosition} = require('../ChromPosition');
import RefGeneAnnotation from '../refGeneExons';
import {GeneLabelAnnotation, geneLableFont} from '../geneLabelAnnotation';
import { matches } from 'static-interval-tree';
var gaEvents = require('../gaEvents');
import crosshair from './cursor.png';
var ZoomHelpTag = require('./ZoomHelpTag');
var ZoomOverlay = require('./ZoomOverlay');
var config = require('../config');
import {AVAILABLE_GENESET_COHORTS, GENESETS_VIEWER_URL, GeneSetViewDialog} from './GeneSetViewDialog';
import {setUserCodes} from '../models/denseMatrix';
import {isChrom, getGeneMode} from '../models/columns';


// We're getting events with coords < 0. Not sure if this
// is a side-effect of the react event system. This will
// restrict values to the given range.
function bounded(min, max, x) {
	return x < min ? min : (x > max ? max : x);
}

var ESCAPE = 27;

class IconMenu extends React.Component {
	onKeyDown = ev => {
		if (ev.keyCode === ESCAPE) {
			this.ref.handleMenuHide();
		}
	};
	cleanup() {
		// We get an onHide() call from setting state in Menu, *and*
		// from this.ref.handleMenuHide(), during this.onKeyDown. So,
		// check if 'curtain' still exists before tear down.
		if (this.curtain) {
			document.body.removeChild(this.curtain);
			document.removeEventListener('keydown', this.onKeyDown);
			delete this.curtain;
		}
	}
	componentWillUnmount() {
		this.cleanup();
	}
	onHide = () => {
		var {onHide} = this.props;
		this.cleanup();
		onHide && onHide();
	};
	onShow = () => {
		var {onShow} = this.props;
		this.curtain = document.createElement('div');
		this.curtain.style = "position:absolute;top:0;left:0;width:100%;height:100%";
		document.body.appendChild(this.curtain);
		document.addEventListener('keydown', this.onKeyDown, false);
		onShow && onShow();
	};
	onRef = ref => {
		this.ref = ref;
	};
	render() {
		var others = _.omit(this.props, 'onShow', 'onHide');
		return <RTIconMenu innerRef={this.onRef} onShow={this.onShow} onHide={this.onHide} {...others}/>;
	}
}


function uniqueNotNull(data) {
  return _.uniq(data).filter( f => f !== null);
}

const TooltipMenuItem_ = Tooltip(MenuItem);


const tooltipConfig = {
	tooltipDelay: 750,
	tooltipPosition: "horizontal",
	style: {pointerEvents: 'all'}
};

// menu item that shows tooltip when disabled. react-toolbox Tooltip
// doesn't allow hiding of the tooltip, or setting to null, so we have
// to remove the Tooltip component entirely.
var TooltipMenuItem = props => props.disabled ?
	<TooltipMenuItem_ {...{...props, ...tooltipConfig}}/> :
	<MenuItem {..._.omit(props, 'tooltip')}/>;


// XXX move this?
function download([fields, rows]) {
	var txt = _.map([fields].concat(rows), row => row.join('\t')).join('\n');
	// use blob for bug in chrome: https://code.google.com/p/chromium/issues/detail?id=373182
	var url = URL.createObjectURL(new Blob([txt], { type: 'text/tsv' }));
	var a = document.createElement('a');
	var filename = 'xenaDownload.tsv';
	_.extend(a, { id: filename, download: filename, href: url });
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

function downloadJSON(downloadData) {
	// use blob for bug in chrome: https://code.google.com/p/chromium/issues/detail?id=373182
	var url = URL.createObjectURL(new Blob([JSON.stringify(downloadData/*, undefined, 4*/)], { type: 'text/json' }));
	var a = document.createElement('a');
	var filename = 'xenaDownload.json';
	_.extend(a, { id: filename, download: filename, href: url });
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

export var annotationHeight = 47,
	positionHeight = 17,
	scaleHeight = 12;

var styles = {
	status: {
		pointerEvents: 'none',
		textAlign: 'center',
		zIndex: 1,
		position: 'absolute',
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
		backgroundColor: 'rgba(255, 255, 255, 0.6)'
	},
	error: {
		textAlign: 'center',
		pointerEvents: 'all',
		cursor: 'pointer'
	}
};

// Manually set focus to avoid triggering dropdown (close) or anchor
// (navigate) actions.
/*var setFocus = ev => {
	ev.preventDefault();
	ev.stopPropagation();
	ev.target.focus();
};

var stopPropagation = ev => ev.stopPropagation();
*/

var addIdsToArr = arr => {
	var list = arr.filter(el => el).map((el, id) => React.cloneElement(el, {key: id}));
	return _.isEmpty(list) ? null : list;
};
var isIntString = str => !!str.trim().replace(/,/g, '').match(/^[0-9]+$/);
var parseExtendedInt = str => parseInt(str.trim().replace(/,/g, ''), 10);

var boundIsValid = _.curry((maxXZoom, str) => {
	if (!maxXZoom) {
		return false; // no data
	}
	if (str.trim() === '') {
		return true;
	}
	if (!isIntString(str)) { // must be an int if it's not empty string
		return false;
	}
	var pos = parseExtendedInt(str);

	return maxXZoom.start <= pos && pos <= maxXZoom.end;
});

/*function zoomMenu(props) {
	var {column} = props,
		{xzoom, maxXZoom, assembly} = column,
		{start, end} = xzoom || maxXZoom || {start: 0, end: 0},
		bIV = boundIsValid(maxXZoom);
	return [
		<MenuItem header style={{fontSize: '80%'}}>Start position ( {assembly} )</MenuItem>,
		<MenuItem>
			<ValidatedInput defaultValue={start} isValid={bIV} ref='start' onSelect={stopPropagation} onClick={setFocus} type='text' bsSize='small' />
		</MenuItem>,
		<MenuItem header style={{fontSize: '80%'}}>End position ( {assembly} )</MenuItem>,
		<MenuItem>
			<ValidatedInput defaultValue={end} isValid={bIV} ref='end' onSelect={stopPropagation} onClick={setFocus} type='text' bsSize='small' />
		</MenuItem>];
}*/

function sortVisibleLabel(column, pos) {
	var sortVisible = _.get(column, 'sortVisible', true);

	return sortVisible ?
			(pos ? 'Sort by full region avg' : 'Sort by gene average') :
			'Sort by zoom region avg';
}

function segmentedVizOptions(onVizOptions) {
	return onVizOptions ? [
		<MenuDivider/>,
		<MenuItem onSelect={onVizOptions} data-renderer='line' caption='Line'/>,
		<MenuItem onSelect={onVizOptions} data-renderer='pixel' caption='Pixel'/>,
		<MenuItem onSelect={onVizOptions} data-renderer='power' caption='Power'/>,
		<MenuDivider/>] : [];
}

function segmentedMenu(props, {onShowIntrons, onSortVisible, onSpecialDownload, onVizOptions}) {
	var {column, data} = props,
		pos = parsePos(column.fields[0]), // XXX Should compute a flag for this.
		{showIntrons = false} = column,
		noData = !_.get(data, 'req'),
		sortVisibleItemName = sortVisibleLabel(column, pos),
		intronsItemName =  showIntrons ? 'Hide introns' : "Show introns",
		specialDownloadItemName = 'Download segments';

	return addIdsToArr([
		...(pos ? [] : [<MenuItem disabled={noData} onClick={onShowIntrons} caption={intronsItemName}/>]),
		...(segmentedVizOptions(onVizOptions)),
		//...(xzoomable ? zoomMenu(props, {onSortVisible}) : []),
		<MenuItem disabled={noData} onClick={onSortVisible} caption={sortVisibleItemName}/>,
		<MenuItem disabled={noData} onClick={onSpecialDownload} caption={specialDownloadItemName}/>
	]);
}

function mutationMenu(props, {onMuPit, onShowIntrons, onSortVisible}) {
	var {column, data} = props,
		pos = parsePos(column.fields[0]),
		{valueType, sortVisible, assembly, showIntrons = false} = column,
		rightValueType = valueType === 'mutation',
		wrongDataSubType = column.fieldType !== 'mutation',
		rightAssembly = (["hg19", "hg38", "GRCh37", "GRCh38"].indexOf(assembly) !== -1) ? true : false,  //MuPIT support hg19, hg38
		noMuPit = !rightValueType || !rightAssembly || !!wrongDataSubType || !!pos,
		noData = !_.get(data, 'req'),
		mupitItemName = noData ? 'MuPIT 3D Loading' : 'MuPIT 3D (' + assembly + ' coding)',
		sortVisibleItemName = sortVisible ? 'Sort using full region' : 'Sort using zoom region',
		intronsItemName =  showIntrons ? 'Hide introns' : "Show introns",
		mupitTooltip = pos ? 'Only available for gene view' :
			noMuPit ? 'Only available for SNPs on hg19 and hg38' :
			null,
		mupitMenuItem = null;

	if (data && !(_.isEmpty(data.refGene))) {
		mupitMenuItem = (<TooltipMenuItem onClick={(e) => onMuPit(assembly, e)}
			disabled={noMuPit} tooltip={mupitTooltip} caption={mupitItemName}/>);
	}

	return addIdsToArr([
		mupitMenuItem,
		pos ? null : <MenuItem disabled={noData} onClick={onShowIntrons} caption={intronsItemName}/>,
		//...(xzoomable ? zoomMenu(props, {onSortVisible}) : []),
		<MenuItem disabled={noData} onClick={onSortVisible} caption={sortVisibleItemName}/>
	]);
}

var isSig = column => column.fetchType === 'signature';

function tumorMapCompatible(column) {
	var {fieldType, dsID, fields} = column;
	// link to tumorMap from any public xena hub columns
	// data be queried directly from xena
	var foundPublicHub = dsID && publicServers.indexOf(JSON.parse(dsID).host) !== -1;

	// The intent is to support anything that can be queried as a single value
	// with (xena-query {:select}). Here 'fields' is the fields or probes list.
	// We can only send a single probe, so check for length 1. Note in
	// particular the case of an ensembl genes probemap, which is a geneProbes
	// column with probe list of one, which is supported.
	// We can't support gene average, so no 'genes' columns.
	if (!foundPublicHub || ['geneProbes', 'probes', 'clinical'].indexOf(fieldType) === -1 ||
			isSig(column) || fields.length !== 1) {
		return false;
	}

	return true;
}

// Maybe put in a selector.
var supportsGeneAverage = column =>
	!isChrom(column) && !isSig(column) && _.contains(['geneProbes', 'genes'], column.fieldType) &&
		(column.fieldList || column.fields).length === 1;

// Duplicated in denseMatrix.js, because of the weirdness with
// fields vs. probes.
var supportsClustering = ({fieldType, fields}) =>
	_.contains(['genes', 'probes', 'geneProbes'], fieldType) && fields.length > 2;

var supportsDEA = (column, data) =>
	column.codes &&
	_.reject(_.uniq(_.getIn(data, ['req', 'values', 0])),
		x => x == null).length > 1;

function matrixMenu(props, {onTumorMap, thisTumorMap, onMode, onCluster, onDiff}) {
	var {column, isPublic, preferredExpression, data} = props,
		{fieldType, clustering} = column,
		supportTumorMap = thisTumorMap && tumorMapCompatible(column),
		order = clustering == null ? 'Cluster' : 'Uncluster';

	return addIdsToArr([
		supportsClustering(column) ?
			<MenuItem onClick={onCluster} caption={order} disabled={config.singlecell} /> :
			null,
		preferredExpression && supportsDEA(column, data) ?
			<TooltipMenuItem onClick={onDiff} disabled={!isPublic}
				tooltip='Private data not allowed' caption='Differential expression' /> :
			null,
		supportsGeneAverage(column) ?
			(fieldType === 'genes' ?
				<MenuItem onClick={(e) => onMode(e, 'geneProbes')} caption='Detailed view'/> :
				<MenuItem onClick={(e) => onMode(e, 'genes')} caption='Gene average'/>) :
				null,
		supportTumorMap ?
			<MenuItem onClick={(e) => onTumorMap(thisTumorMap, e)} caption={`Tumor Map`}/> :
			null
	]);
}

// We could try to drive this from the column widgets, but it gets rather complex making
// the widgets care about a menu in their container.
function optionMenu(props, opts) {
	var {column: {valueType}} = props;
	return (valueType === 'mutation' ?  mutationMenu :
			(valueType === 'segmented' ? segmentedMenu : matrixMenu))(props, opts);
}

function getStatusView(status, onReload) {
	if (status === 'loading') {
		return (
			<div data-xena='loading' style={styles.status}>
				<img style={{textAlign: 'center'}} src={spinner}/>
			</div>);
	}
	if (status === 'error') {
		return (
			<div style={styles.status}>
				<i onClick={onReload}
				   style={styles.error}
				   title='Error loading data. Click to reload.'
				   aria-hidden='true'
				   className={'material-icons'}>warning</i>
			</div>);
	}
	return null;
}

function getPosition(maxXZoom, pStart, pEnd) {
	if (!boundIsValid(maxXZoom, pStart) || !boundIsValid(maxXZoom, pEnd)) {
		return false;
	}
	var [start, end] = pStart < pEnd ? [pStart, pEnd] : [pEnd, pStart];

	start = start.trim() === '' ? maxXZoom.start : parseExtendedInt(start);
	end = end.trim() === '' ? maxXZoom.end : parseExtendedInt(end);

	return (maxXZoom.start <= start &&
			start <= end &&
			end <= maxXZoom.end) ? {start, end} : null;
}

var specialDownloadMenu = false;
//var annotationHelpText =  'Drag zoom. Shift-click zoom out.';

if (process.env.NODE_ENV !== 'production') {
	specialDownloadMenu = true;
}

// For geneProbes we will average across probes to compute KM. For
// other types, we can't support multiple fields.
function disableKM(column, hasSurvival) {
	if (!hasSurvival) {
		return [true, 'No survival data for cohort'];
	}
	// XXX need to refactor column.fields & column.fieldList
	if ((column.fieldList || column.fields).length > 1) {
		return [true, 'Unsupported for multiple genes/ids'];
	}
	return [false, ''];
}

function disableChart(column) {
	if (_.contains(['mutation', 'SV'], column.fieldType)) {
		return true;
	}
	return false;
}

function getCodingVariants(index, exons) {
	const resultSet = new Set();

	exons.forEach(([start, end]) => {
		matches(index, {start: start, end: end})
			.forEach(item => resultSet.add(item.variant));
	});

	return [...resultSet];
}

function filterExonsByCDS(exonStarts, exonEnds, cdsStart, cdsEnd) {
	return _.zip(exonStarts, exonEnds)
		.filter(([start, end]) => !(end < cdsStart || start > cdsEnd))
		.map(([start, end]) => [Math.max(start, cdsStart), Math.min(end, cdsEnd)]);
}

var geneHeight = () => {
	return annotationHeight + scaleHeight + 4;
};

export var showPosition = column =>
	_.contains(['segmented', 'mutation', 'SV', 'geneProbes'], column.fieldType) &&
	_.getIn(column, ['dataset', 'probemapMeta', 'dataSubType']) !== 'regulon';

var showGeneLabel = column =>
	_.contains(['genes', 'probes', 'clinical'], column.fieldType) ||
	(column.fieldType === 'geneProbes' &&
	_.getIn(column, ['dataset', 'probemapMeta', 'dataSubType']) === 'regulon');

	// Drag mapped to: direction, samples start, samples end, indicator start, indicator end (where indicator is either
// annotation or sample zoom), offset x, offset y, samples height
// Select mapped to: direction, data start and data end
var zoomTranslateSelection = (props, selection, zone) => {

	var {column} = props,
		yZoom = props.zoom,
		{crosshair, start, end, offset} = selection,
		{fieldType} = column,
		annotated = showPosition(column),
		direction = columnZoom.direction({fieldType, start, end, zone}),
		startEndPx = columnZoom.startEndPx({direction, start, end}),
		overlay = columnZoom.overlay({annotated, column, direction, fieldType, ...startEndPx, zone}),
		zoomTo = columnZoom.zoomTo({annotated, column, direction, fieldType, ...overlay, yZoom});

	return {
		crosshair,
		direction,
		offset,
		overlay,
		zone,
		zoomTo
	};
};

export default class Column extends PureComponent {
	state = {
		dragZoom: {},
		subColumnIndex: {},
		specialDownloadMenu: specialDownloadMenu,
		showGeneSetWizard: false,
		geneSetUrl: undefined,

	};

	//	addAnnotationHelp(target) {
	//		var tooltip = (
	//			<Tooltip>
	//				{annotationHelpText}
	//			</Tooltip>
	//		);
	//		return (
	//			<OverlayTrigger trigger={['hover']} placement='top' overlay={tooltip}>
	//				{target}
	//			</OverlayTrigger>);
	//	},
	enableHiddenFeatures = () => {
		specialDownloadMenu = true;
		this.setState({specialDownloadMenu: true});
	};

	toggleInteractive = (interactive) => {
		this.props.onInteractive('zoom', interactive);
	};

	initSubColumnIndex = () => {
		var {column} = this.props;
		if (_.contains(['probes', 'genes'], column.fieldType) ||
				_.getIn(column, ['dataset', 'probemapMeta', 'dataSubType'])
					=== 'regulon') {
			var aveSize = geneLableFont * (column.fields.reduce((total, x) =>
					total + (x ? x.length : 0), 0) / column.fields.length);

			this.setState({subColumnIndex: {aveSize}});
		}
	};

	componentWillMount() {
		var asciiA = 65;
		this.ksub = konami(asciiA).subscribe(this.enableHiddenFeatures);
		this.initSubColumnIndex();
	}

	componentWillUnmount() {
		this.ksub.unsubscribe();
	}

	onResizeStop = (size) => {
		this.props.onResize(this.props.id, size);
	};

	onRemove = () => {
		this.props.onRemove(this.props.id);
	};

	onDownload = () => {
		var {column, data, samples, index, sampleFormat} = this.props;
		gaEvents('spreadsheet', 'download', 'column');
		download(widgets.download({column, data, samples, index: index, sampleFormat}));
	};

	onViz = () => {
		this.props.onViz(this.props.id);
	};

	onEdit = () => {
		this.props.onEdit(this.props.id);
	};

	onKm = () => {
		gaEvents('spreadsheet', 'km');
		this.props.onKm(this.props.id);
	};

	onChart = () => {
		gaEvents('spreadsheet', 'columnChart-open');
		this.props.onChart(this.props.id);
	};



	canDoGeneSetComparison = () => {
    let {column: {fieldType, valueType, heatmap}, data: {codes}, cohort: {name}} = this.props;
    if(
      fieldType !== 'clinical' ||
      valueType !== 'coded' ||
      !codes || codes.length < 2  ||
      AVAILABLE_GENESET_COHORTS.indexOf(name) < 0
    ) {
      return false ;
    }
    return (uniqueNotNull(heatmap[0]).length === 2);
  };

	hideGeneSetWizard = () => {
		this.setState({
			showGeneSetWizard: false,
		});
	};


  /**
   * We build out the URL.
   * generate URL with cohort A, cohort B, samples A (and name a sub cohort), samples B (and name a sub cohort), analysis
   */
  showGeneSetComparison = () => {
    const {column: {heatmap, codes}, cohort: {name} } = this.props;
    const heatmapData = heatmap[0].filter( f => f !== null);
    const heatmapCodes = uniqueNotNull(heatmapData);
    const heatmapLookup = _.invert(heatmapCodes);
    const sampleData = _.map(this.props.samples, this.props.sampleFormat);
    let subCohortData = [[], []];
    const heatmapLabels = [codes[heatmapCodes[0]], codes[heatmapCodes[1]]];
    for (const d in heatmapData) {
        subCohortData[heatmapLookup[heatmapData[d]]].push(sampleData[d]);
    }

	const subCohortA = `subCohortSamples1=${name}:${heatmapLabels[0]}:${subCohortData[0]}&selectedSubCohorts1=${heatmapLabels[0]}&cohort1Color=${categoryMore[heatmapCodes[0]]}`;
	const subCohortB = `subCohortSamples2=${name}:${heatmapLabels[1]}:${subCohortData[1]}&selectedSubCohorts2=${heatmapLabels[1]}&cohort2Color=${categoryMore[heatmapCodes[1]]}`;

   const finalUrl = `${GENESETS_VIEWER_URL}cohort=${name}&wizard=analysis&${subCohortA}&${subCohortB}`;

	this.setState({
	  geneSetUrl: `${finalUrl}`,
	  showGeneSetWizard: true,
	  onHide: this.hideGeneSetWizard,
	});
  };

	onSortDirection = () => {
		var newDir = _.get(this.props.column, 'sortDirection', 'forward') === 'forward' ?
			'reverse' : 'forward';
		this.props.onSortDirection(this.props.id, newDir);
	};

	onMode = (ev, newMode) => {
		this.props.onMode(this.props.id, newMode);
	};

	onColumnLabel = (value) => {
		this.props.onColumnLabel(this.props.id, value);
	};

	onFieldLabel = (value) => {
		this.props.onFieldLabel(this.props.id, value);
	};

	onShowIntrons = () => {
		this.props.onShowIntrons(this.props.id);
	};

	onCluster = () => {
		this.props.onCluster(this.props.id,
			this.props.column.clustering ? undefined : 'probes', this.props.data);
	};

	canPickSamples = ev => {
		var {samples, zoom} = this.props,
			coord = util.eventOffset(ev),
			sampleIndex = bounded(0, samples.length, Math.floor((coord.y * zoom.count / zoom.height) + zoom.index));

		return this.props.canPickSamples(this.props.id, sampleIndex);
	}

	dragEnabled = ev => {
		return !this.props.wizardMode &&
			!(this.props.pickSamples && !this.canPickSamples(ev));
	}

	onPickSamplesDrag = selection => {
		this.toggleInteractive(false);
		var translatedSelection = zoomTranslateSelection(this.props, selection, 'f');
		var flop = selection.start.y > selection.end.y;
		this.setState({dragZoom: {selection: translatedSelection, picking: true}});
		this.props.onPickSamplesSelect(this.props.id, translatedSelection.zoomTo, flop);
	}

	onPickSamplesDragSelect  = selection => {
		this.toggleInteractive(true);
		var translatedSelection = zoomTranslateSelection(this.props, selection, 'f');
		var flop = selection.start.y > selection.end.y;
		this.setState({dragZoom: {}});
		this.props.onPickSamplesSelect(this.props.id, translatedSelection.zoomTo, flop, true);
	}

	onDragZoom(selection, zone) {
		this.toggleInteractive(false);
		var translatedSelection = zoomTranslateSelection(this.props, selection, zone);
		this.setState({dragZoom: {selection: translatedSelection}});
	};

	onDragZoomSelect(selection, zone) {
		this.toggleInteractive(true);
		var {id, onXZoom, onYZoom, zoom} = this.props,
			translatedSelection = zoomTranslateSelection(this.props, selection, zone),
			h = translatedSelection.direction === 'h',
			zoomTo = translatedSelection.zoomTo;
		this.setState({dragZoom: {}});
		h ? onXZoom(id, {start: zoomTo.start, end: zoomTo.end}) : onYZoom(_.merge(zoom, zoomTo));
	};

	onDragZoomSelectS = selection => this.onDragZoomSelect(selection, 's');
	onDragZoomSelectA = selection => this.onDragZoomSelect(selection, 'a');
	onDragZoomS = selection => this.onDragZoom(selection, 's');
	onDragZoomA = selection => this.onDragZoom(selection, 'a');

	onSortVisible = () => {
		var {id, column} = this.props;
		var value = _.get(column, 'sortVisible',
				column.valueType === 'segmented' ? true : false);
		this.props.onSortVisible(id, !value);
	};

	onSpecialDownload = () => {
		var {column, data, samples, index, sampleFormat} = this.props,
			{type, downloadData} = widgets.specialDownload({column, data, samples, index: index, sampleFormat});
		if (type === "txt") {
			download(downloadData);
		} else if(type === "json") {
			downloadJSON(downloadData);
		}
	};

	onXZoomClear = () => {
		let {id, column: {maxXZoom}, onXZoom} = this.props,
			position = getPosition(maxXZoom, '', '');
		onXZoom(id, position);
	};

	onMenuToggle = (open) => {
		var {xzoomable} = this.state,
			{column: {xzoom, maxXZoom, valueType}, onXZoom, id} = this.props;
		if (xzoomable && !open && ['mutation', 'segmented'].indexOf(valueType) !== -1) {
			let start = this.refs.start.getValue(),
				end = this.refs.end.getValue(),
				position = getPosition(maxXZoom, start, end);

			if (position && !_.isEqual(position, xzoom)) {
				onXZoom(id, position);
			}
		}
	};

	onMuPit = (assembly) => {
		// Construct the url, which will be opened in new window
		// total = newRows.length,
		// k fixed at 1000
		// gene, protein, etc size is fixed at 1000
		// this could be actual size of protein or gene, but it is complicated due to mutations could be from exon region and display could be genomics region
		// for the same gene it is a constant, does it really matter to be different between genes?
		const k = 1000,
			indexByPos = this.props.index.byPosition,
			{ exonStarts, exonEnds, cdsStart, cdsEnd } = _.values(this.props.data.refGene)[0];

		const exons = filterExonsByCDS(exonStarts, exonEnds, cdsStart, cdsEnd),
			variants = getCodingVariants(indexByPos, exons); //coding variants

		let SNVPs = mutationVector.SNVPvalue(variants, variants.length, k);
		if (this.props.column.xzoom) {
			const { start: zoomStart, end: zoomEnd } = this.props.column.xzoom;
			SNVPs = _.filter(SNVPs, value => {
				const valueStart = parseInt(value.start);
				return valueStart >= zoomStart && valueStart <= zoomEnd;
			});
		}

		const uriList = _.map(SNVPs, n => `${n.chr}:${n.start}:${1 - n.pValue}`).join(','),
			mupitUrl = {
				"hg19": 'http://hg19.cravat.us/MuPIT_Interactive?gm=', // mupit hg19 server
				"GRCh37": 'http://hg19.cravat.us/MuPIT_Interactive?gm=', // mupit hg19 server
				"hg38": 'http://mupit.icm.jhu.edu/MuPIT_Interactive?gm=', //mupit hg38 server
				"GRCh38": 'http://mupit.icm.jhu.edu/MuPIT_Interactive?gm=' //mupit hg38 server
			},
			url = mupitUrl[assembly];

		window.open(url + `${uriList}`);
	};

	onDiff = () => {
		gaEvents('spreadsheet', 'DEA');
		var {preferredExpression, samples: indicies, sampleFormat, data: dataIn, cohort,
				column} = this.props,
			data = setUserCodes(column, dataIn),
			samples = _.times(indicies.length, sampleFormat),
			fieldLabel = _.getIn(column, ['user', 'fieldLabel']),
			uniqValues = _.uniq(_.getIn(data, ['req', 'values', 0])),
			filteredCodes = data.codes.filter((code, i) => uniqValues.includes(i)),
			payload = JSON.stringify({preferredExpression, filteredCodes, samples, data, cohort, fieldLabel}),
			//notebook = 'http://localhost:5000';
			notebook = 'http://analysis.xenahubs.net';

		var w = window.open(notebook);

		var count = 0, d = 50;
		var i = setInterval(function() {
			w.postMessage(payload, '*');
			count++;
			if (count > 2 * 1000 * 60 / d) { // try for 2 minutes
				clearInterval(i);
				i = null;
			}

		}, d);
		window.addEventListener("message", () => {
			//	  if (event.origin !== "http://localhost:5000")
			//		return;
			if (i != null) {
				clearInterval(i);
				i = null;
			}
		}, false);
	}

	onTumorMap = (tumorMap) => {
		// TumorMap/Xena API https://tumormap.ucsc.edu/query/addAttributeXena.html
		var {data, column} = this.props,
			{valueType} = column,
			url = "https://tumormap.ucsc.edu/?xena=addAttr&p=" + tumorMap.map + "&layout=" + tumorMap.layout;

		var ds = JSON.parse(this.props.column.dsID),
			hub = ds.host,
			dataset = ds.name,
			feature = this.props.column.fields[0], // gene or probe
			customColors = _.getIn(column, ['colors', 0, 2]);

		url = url + "&hub=" + hub + "/data/";
		url = url + "&dataset=" + dataset;
		url = url + "&attr=" + feature;

		if (valueType === "coded") {
			var codes = _.getIn(data, ['codes']),
				cat, colorhex;
			_.map(codes, (code, i) => {
				cat = code;
				colorhex = customColors ? customColors[i] : categoryMore[i % categoryMore.length];
				colorhex = colorhex.slice(1, colorhex.length);
				url = url + "&cat=" + encodeURIComponent(cat);
				url = url + "&color=" + colorhex;
			});
		}

		window.open(url);
	};

	onReload = () => {
		this.props.onReload(this.props.id);
	};

	getControlWidth = () => {
		return 90;
//		return 136;
	};

	onAbout = (ev, host, dataset) => {
		ev.preventDefault();
		this.props.onAbout(host, dataset);
	};

	render() {
		var {first, id, label, samples, samplesMatched, column, index,
				zoom, data, fieldFormat, sampleFormat, hasSurvival, searching,
				onClick, tooltip, wizardMode, onReset,
				pickSamples, interactive, append, cohort, tumorMap} = this.props,
			{specialDownloadMenu, dragZoom, subColumnIndex} = this.state,
			{selection} = dragZoom,
			zoomMethod = pickSamples ? {
					onDrag: this.onPickSamplesDrag,
					onSelect: this.onPickSamplesDragSelect
				} : {
					onDrag: this.onDragZoomS,
					onSelect: this.onDragZoomSelectS
				},
			{width, dataset, columnLabel, fieldLabel, user} = column,
			{onDiff, onMode, onTumorMap, onMuPit, onCluster, onShowIntrons, onSortVisible, onSpecialDownload} = this,
			thisTumorMap = _.getIn(tumorMap, [cohort.name]),
			menu = optionMenu(this.props, {onMode, onMuPit, onTumorMap, thisTumorMap,
				onShowIntrons, onSortVisible, onCluster, onSpecialDownload,
				onDiff, specialDownloadMenu, isSig}),
			[kmDisabled, kmTitle] = disableKM(column, hasSurvival),
			chartDisabled = disableChart(column),
	    canDoGeneSetComparison = this.canDoGeneSetComparison(),
      status = _.get(data, 'status'),
			refreshIcon = (<i className='material-icons' onClick={onReset}>close</i>),
			// move this to state to generalize to other annotations.
			annotation = showPosition(column) ?
				<RefGeneAnnotation
					id={id}
					column={column}
					position={_.getIn(column, ['layout', 'chrom', 0])}
					refGene={_.getIn(data, ['refGene'], {})}
					probePosition={column.position}
					tooltip={tooltip}
					layout={column.layout}
					height={annotationHeight}
					positionHeight={column.position ? positionHeight : 0}
					width={width}/>
				: null,
			scale = showPosition(column) ?
				<ChromPosition
					layout = {column.layout}
					width = {width}
					scaleHeight ={scaleHeight}
					mode = {getGeneMode(column)}/>
				: null,
			geneLabel = showGeneLabel(column) ?
				<GeneLabelAnnotation
					tooltip={tooltip}
					width={width}
					height={annotationHeight + scaleHeight}
					list = {column.fields}
					subColumnIndex = {subColumnIndex}/>
				: null;

		// FF 'button' tag will not emit 'mouseenter' events (needed for
		// tooltips) for children. We must use a different tag, e.g. 'label'.
		// Button and Dropdown.Toggle will allow overriding the tag.  However
		// Splitbutton will not pass props down to the underlying Button, so we
		// can't use Splitbutton.
		// XXX put position into a css module
		return (
				<div style={{width: width, position: 'relative'}}>
          { this.state.geneSetUrl &&
          <GeneSetViewDialog showGeneSetWizard={this.state.showGeneSetWizard} geneSetUrl={this.state.geneSetUrl} onHide={this.hideGeneSetWizard}/>
          }
					<ZoomOverlay geneHeight={geneHeight()} height={zoom.height}
								 positionHeight={column.position ? positionHeight : 0} {...dragZoom}>
						<ColCard colId={label}
								sortable={!first}
								title={<DefaultTextInput
									disabled={!interactive}
									onChange={this.onColumnLabel}
									value={{default: columnLabel, user: user.columnLabel}} />}
								subtitle={<DefaultTextInput
									disabled={!interactive}
									onChange={this.onFieldLabel}
									value={{default: fieldLabel, user: user.fieldLabel}} />}
								onClick={this.onXZoomClear}
								geneZoomText={columnZoom.zoomText(column)}
								controls={!interactive ? (first ? refreshIcon : null) :
									<div>
										{first ? null : (
											<IconMenu icon='more_vert' menuRipple iconRipple={false}>
												{menu}
												{menu && <MenuDivider />}
												<MenuItem title={kmTitle} onClick={this.onKm} disabled={kmDisabled}
													caption='Kaplan Meier Plot'/>
												<MenuItem onClick={this.onChart} disabled={chartDisabled}
													caption='Chart & Statistics'/>
                        {canDoGeneSetComparison &&
                        <MenuItem onClick={this.showGeneSetComparison}
                                  caption='Differential Geneset View'/>
                        }
												<MenuItem onClick={this.onSortDirection} caption='Reverse sort'/>
												<MenuItem onClick={this.onDownload} caption='Download'/>
												{aboutDatasetMenu(this.onAbout, _.get(dataset, 'dsID'))}
												<MenuItem onClick={this.onViz} caption='Display'/>
												<MenuItem disabled={!this.props.onEdit} onClick={this.onEdit} caption='Edit'/>
												<MenuItem onClick={this.onRemove} caption='Remove'/>
												</IconMenu>)}
									</div>
								}
								 wizardMode={wizardMode}>
							<div style={{cursor: selection ? 'none' : annotation ? `url(${crosshair}) 12 12, crosshair` : 'default', height: geneHeight()}}>
									<DragSelect enabled={this.dragEnabled} onDrag={this.onDragZoomA} onSelect={this.onDragZoomSelectA}>
									{annotation ?
										<div>
											{scale}
											<div style={{height: 2}}/>
											{annotation}
										</div> : geneLabel}
								</DragSelect>
							</div>
							<ResizeOverlay
								enable={interactive}
								onResizeStop={this.onResizeStop}
								width={width}
								minWidth={this.getControlWidth}
								height={zoom.height}>
								<SpreadSheetHighlight
									animate={searching}
									width={width}
									height={zoom.height}
									samples={samples.slice(zoom.index, zoom.index + zoom.count)}
									samplesMatched={samplesMatched}/>
								<div style={{position: 'relative'}}>
									<Crosshair canPickSamples={this.canPickSamples} picker={pickSamples} interactive={interactive} geneHeight={geneHeight()} height={zoom.height} selection={selection} tooltip={tooltip}>
										<DragSelect enabled={this.dragEnabled} allowClick={pickSamples} {...zoomMethod}>
											{widgets.column({ref: 'plot', id, column, data, index, zoom, samples, onClick, fieldFormat, sampleFormat, tooltip})}
										</DragSelect>
										{getStatusView(status, this.onReload)}
										<ZoomHelpTag column={column} {...dragZoom}/>
									</Crosshair>
								</div>
							</ResizeOverlay>
						</ColCard>
					</ZoomOverlay>
					{append}
				</div>
		);
	}
}
