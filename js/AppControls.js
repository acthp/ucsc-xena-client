/*global require: false, module: false */

'use strict';

var React = require('react');
var CohortSelect = require('./CohortSelect');
var DatasetSelect = require('./DatasetSelect');
//var _ = require('./underscore_ext');
var Button = require('react-bootstrap/lib/Button');
var Tooltip = require('react-bootstrap/lib/Tooltip');
var OverlayTrigger = require('react-bootstrap/lib/OverlayTrigger');

var modeButton = {
	chart: 'Heatmap',
	heatmap: 'Chart'
};

var modeEvent = {
	chart: 'heatmap',
	heatmap: 'chart'
};

// XXX drop this.props.style? Not sure it's used.
var AppControls = React.createClass({
	onMode: function () {
		var {callback, appState: {mode}} = this.props;
		callback([modeEvent[mode]]);
	},
	onRefresh: function () {
		var {callback} = this.props;
		callback(['refresh-cohorts']);
	},
	render: function () {
		var {callback, appState: {cohort, cohorts, samplesFrom, datasets, mode}} = this.props,
			hasCohort = !!cohort,
			disableMenus = (mode === modeEvent.heatmap);

		const tooltip = <Tooltip id='reload-cohorts'>Reload cohorts from all hubs.</Tooltip>
		return (
			<form className='form-inline'>
				<OverlayTrigger placement="top" overlay={tooltip}>
					<Button onClick={this.onRefresh} bsSize='sm' style={{marginRight: 5}}>
						<span className="glyphicon glyphicon-refresh" aria-hidden="true"/>
					</Button>
				</OverlayTrigger>
				<CohortSelect callback={callback} cohort={cohort} cohorts={cohorts} disable={disableMenus}/>
				{' '}
				{hasCohort ?
					<div className='form-group' style={this.props.style}>
						<label className='samplesFromLabel'> Samples in </label>
						{' '}
						<DatasetSelect
							event='samplesFrom'
							callback={callback}
							nullOpt="All Datasets"
							style={{display: hasCohort ?
									'inline' : 'none'}}
							className='samplesFromAnchor'
							datasets={datasets}
							cohort={cohort}
							disable={disableMenus}
							value={samplesFrom} />
					</div> :
				null}
				{' | '}
				<Button onClick={this.onMode} className='chartSelect' bsStyle='primary'>{modeButton[mode]}</Button>
			</form>
		);
	}
});

module.exports = AppControls;
