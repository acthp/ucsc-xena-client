/*globals require: false, module: false */

'use strict';

var React = require('react');
var ReactDOM = require('react-dom');
var Col = require('react-bootstrap/lib/Col');
var Row = require('react-bootstrap/lib/Row');
var Button = require('react-bootstrap/lib/Button');
var Popover = require('react-bootstrap/lib/Popover');
var ColumnEdit = require('./ColumnEdit');
var Sortable = require('./Sortable');
require('react-resizable/css/styles.css');
var _ = require('./underscore_ext');
var widgets = require('./columnWidgets');
var Crosshair = require('./Crosshair');
var Tooltip = require('./Tooltip');
var rxEventsMixin = require('./react-utils').rxEventsMixin;
var meta = require('./meta');
var VizSettings = require('./VizSettings');
require('./Columns.css'); // XXX switch to js styles
require('./YAxisLabel.css'); // XXX switch to js styles

var YAxisLabel = React.createClass({
	render: function () {
		// XXX would prefer to enforce that these keys are present & destructure
		var height = _.getIn(this.props, ['zoom', 'height']),
			index = _.getIn(this.props, ['zoom', 'index']) || 0,
			count = _.getIn(this.props, ['zoom', 'count']) || 0,
			length = _.getIn(this.props, ['samples', 'length']) || 0,
			fraction = count === length ? '' :
				// babel-eslint/issues/31
				`, showing ${ index } - ${ index + count - 1 }`, // eslint-disable-line comma-spacing
			 text = `Samples (N=${ length }) ${ fraction }`;

	return (
			<div style={{height: height}} className="YAxisWrapper">
				<p style={{width: height}} className="YAxisLabel">{text}</p>
			</div>
		);
	}
});

function zoomIn(pos, samples, zoom) {
	var {count, index} = zoom;
	var nCount = Math.max(1, Math.round(count / 3)),
		maxIndex = samples - nCount,
		nIndex = Math.max(0, Math.min(Math.round(index + pos * count - nCount / 2), maxIndex));

	return _.merge(zoom, {count: nCount, index: nIndex});
}

function zoomOut(samples, zoom) {
	var {count, index} = zoom;
	var nCount = Math.min(samples, Math.round(count * 3)),
		maxIndex = samples - nCount,
		nIndex = Math.max(0, Math.min(Math.round(index + (count - nCount) / 2), maxIndex));

	return _.merge(zoom, {count: nCount, index: nIndex});
}

function targetPos(ev) {
	var bb = ev.currentTarget.getBoundingClientRect();
	return (ev.clientY - bb.top) / ev.currentTarget.clientHeight;
}

var zoomInClick = ev =>
	!ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey;

var zoomOutClick = ev =>
	!ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.shiftKey;

var domNode;

var Columns = React.createClass({
	// XXX pure render mixin? Check other widgets, too, esp. columns.
	mixins: [rxEventsMixin],
	componentWillMount: function () {
		this.events('tooltip', 'click', 'plotClick');

		this.ev.plotClick.subscribe(ev => {
			let {callback, appState: {zoom, samples}} = this.props;
			if (zoomOutClick(ev)) {
				callback(['zoom', zoomOut(samples.length, zoom)]);
			} else if (zoomInClick(ev)) {
				callback(['zoom', zoomIn(targetPos(ev), samples.length, zoom)]);
			}
		});

		var toggle = this.ev.click.filter(ev => {
			ev.stopPropagation();
			return ev[meta.key];
		}).map(() => 'toggle');

		this.tooltip = this.ev.tooltip.merge(toggle)
			.scan([null, false], ([tt], ev) =>
				(ev === 'toggle') ? [tt, tt.open && !this.state.frozen] : [ev, this.state.frozen])
			// Filter frozen events until frozen state changes.
			.distinctUntilChanged(([ev, frozen]) => frozen ? frozen : [ev, frozen])
			.subscribe(([ev, frozen]) => {
				/* `this.state.frozen` is the CURRENT frozen status
				 	`ev.frozen` represents the TO-BE frozen status
				*/
				if (!this.state.frozen && frozen) {
					this.adjustFrozen({frozen: frozen});
				}
				let plotVisuals = {
					crosshair: _.omit(ev, 'data'), // remove tooltip-related param
					tooltip: _.omit(ev, 'point') // remove crosshair-related param
				};

				this.setState(plotVisuals);
			});
	},
	componentDidMount: function() {
		this.setDOMDims(ReactDOM.findDOMNode(this));
		domNode = document.querySelector('body');
		domNode.addEventListener('click', this.dispatchUnFreeze, true);
	},
	componentWillUnmount: function () { // XXX refactor into a takeUntil mixin?
		// XXX are there other streams we're leaking? What listens on this.ev.click, etc?
		this.tooltip.dispose();
		domNode.removeEventListener('click', this.dispatchUnFreeze, true);
	},
	getInitialState: function () {
		return {
			dims: {
				clientHeight: 0,
				clientWidth: 0
			},
			crosshair: {open: false},
			frozen: false,
			tooltip: {open: false},
			openVizSettings: null
		};
	},
	setDOMDims: function(domNode) {
		let nodeKeys = _.keys(this.state.dims);
		this.setState({ dims: _.pick(domNode, nodeKeys) });
	},
	setOrder: function (order) {
		this.props.callback(['order', order]);
	},
	onViz: function (id) {
		this.setState({openVizSettings: id});
	},
	dispatchUnFreeze: function(e) {
		if (e[meta.key] && this.state.frozen) {
			this.adjustFrozen({frozen: false});
		}
	},
	adjustFrozen: function(newState) {
		// 1. Set frozen status to opposite of current state.frozen value
		if (!newState.frozen) {
			newState = _.extend(_.mapObject(this.state, param => {
				let action = 'open';
				if (_.has(param, action)) {
					param[action] = newState.frozen;
				}
				return param;
			}), newState);
		}
		this.setState(newState);
	},
	render: function () {
		var {callback, fieldFormat, disableKM, supportsGeneAverage, appState} = this.props;
		// XXX maybe rename index -> indexes?
		var {data, index, zoom, columns, columnOrder, cohort, samples} = appState;
		var {openColumnEdit, openVizSettings, frozen, dims} = this.state;
		var height = zoom.height;
		var editor = openColumnEdit ?
			<ColumnEdit
				{...this.props}
				onHide={() => this.setState({openColumnEdit: false})}
			/> : null;
		// XXX parameterize settings on column type
		var settings = openVizSettings ?
			<VizSettings
				id={openVizSettings}
				dsID={_.getIn(appState, ['columns', openVizSettings, 'dsID'])}
				onRequestHide={() => this.setState({openVizSettings: null})}
				callback={callback}
				state={_.getIn(appState, ['columns', openVizSettings, 'vizSettings'])} /> : null;

		var columnViews = _.map(columnOrder, id => widgets.column({
			ref: id,
			key: id,
			id: id,
			data: _.getIn(data, [id]),
			index: _.getIn(index, [id]),
			vizSettings: _.getIn(appState, [columns, id, 'vizSettings']),
			samples,
			zoom,
			callback,
			fieldFormat,
			disableKM,
			supportsGeneAverage,
			tooltip: this.ev.tooltip,
			onViz: this.onViz,
			onClick: this.ev.plotClick,
			column: _.getIn(columns, [id])
		}));

		return (
			<div className="Columns" ref="columns">
				<Sortable onClick={this.ev.click} setOrder={this.setOrder}>
					{columnViews}
				</Sortable>
				<div
					style={{height: height}}
					className='addColumn Column'>

					{cohort &&
						<Button
							onClick={() => this.setState({openColumnEdit: true})}
							className='Column-add-button'
							title='Add a column'>
							+
						</Button>}
				</div>
				{editor}
				{settings}
				<Crosshair {...this.state.crosshair} frozen={frozen} dims={dims}/>
				<Tooltip {...this.state.tooltip} frozen={frozen}/>
			</div>
		);
	}
});

function zoomPopover(zoom, samples, props) {
	return (
		<Popover {...props} placement="right" positionLeft={-20} positionTop={40} title="Zooming">
			<p>As shown at left, you are now viewing {zoom.count} of the {samples.length} samples.</p>
			<p>Zoom on samples (vertically) by clicking on the graph.</p>
			<p>Zoom out with shift-click.</p>
			<Button onClick={props.onDisableClick}>Don't show this again</Button>
		</Popover>
	);
}

var Spreadsheet = React.createClass({
	zoomHelpClose: function () {
		this.props.callback(['zoom-help-close']);
	},
	zoomHelpDisable: function () {
		this.props.callback(['zoom-help-disable']);
	},
	render: function () {
		var {appState: {zoom, samples, zoomHelp}} = this.props,
			zoomHelper = zoomHelp ?
				zoomPopover(zoom, samples, {
					onClick: this.zoomHelpClose,
					onDisableClick: this.zoomHelpDisable
				}) : null;

		return (
			<Row>
				<Col md={1}>
					<YAxisLabel
						samples={samples}
						zoom={zoom}
					/>
				</Col>
				<Col md={11}>
					<Columns {...this.props}/>
					{zoomHelper}
				</Col>
			</Row>
		);
	}
});

module.exports = Spreadsheet;
