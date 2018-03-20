'use strict';

// XXX move Application to views
var React = require('react');
//var _ = require('../underscore_ext');
var {getSpreadsheetContainer} = require('./SpreadsheetContainer');
var ChartView = require('../ChartView');
var Column = require('../views/Column');
var _ = require('../underscore_ext');
var {rxEvents} = require('../react-utils');
var Rx = require('../rx');
// Spreadsheet options
var addTooltip = require('./addTooltip');
//var disableSelect = require('./disableSelect');
var addWizardColumns = require('./addWizardColumns');
var addVizEditor = require('./addVizEditor');
var makeSortable = require('./makeSortable');
var addColumnAdd = require('./addColumnAdd');
var addLegend = require('./addLegend');
var addHelp = require('./addHelp');
var getSpreadsheet = require('../Spreadsheet');
var getStepperState = require('./getStepperState');
var Application = require('../Application');
var {schemaCheckThrow} = require('../schemaCheck');

function getFieldFormat(uuid, columns, data) {
	var columnFields = _.getIn(columns, [uuid, 'fields']),
		label = _.getIn(columns, [uuid, 'fieldLabel']),
		fields = _.getIn(data, [uuid, 'req', 'probes'], columnFields);
	if (fields.length === 1) {                           // 1 gene/probe, or 1 probe in gene: use default field label
		return () => label;
	} else if (fields.length === columnFields.length) {  // n > 1 genes/probes
		return _.identity;
	} else {                                             // n > 1 probes in gene
		return field => `${label} (${field})`;
	}
}

var columnsWrapper = c => addHelp(addTooltip(addWizardColumns(addColumnAdd(addLegend(makeSortable(addVizEditor(c)))))));
var Spreadsheet = getSpreadsheet(columnsWrapper);
// XXX without tooltip, we have no mouse pointer. Should make the wrapper add the css
// that hides the mouse. Currently this is in Column.
//var columnsWrapper = c => makeSortable(disableSelect(c));
var SpreadsheetContainer = getSpreadsheetContainer(Column, Spreadsheet);


class ApplicationContainer extends React.Component {
	onSearch = (value) => {
		var {callback} = this.props;
		callback(['sample-search', value]);
	};

	componentWillMount() {
		var events = rxEvents(this, 'highlightChange');
		this.change = events.highlightChange
			.debounceTime(200)
			.subscribe(this.onSearch);
		// high on 1st change, low after some delay
		this.highlight = events.highlightChange
			.switchMap(() => Rx.Observable.of(true).concat(Rx.Observable.of(false).delay(300)))
			.distinctUntilChanged(_.isEqual);
	}

	componentWillUnmount() {
		this.change.unsubscribe();
		this.highlight.unsubscribe();
	}

	fieldFormat = (uuid) => {
		var {spreadsheet: {columns, data}} = this.props.state;
		return getFieldFormat(uuid, columns, data);
	};

	sampleFormat = (index) => {
		var {spreadsheet: {cohortSamples}} = this.props.state;
		return _.get(cohortSamples, index);
	};

	// raw (before selector) state
	getState = () => {
		return _.pick(this.props.state, 'version', 'page', 'spreadsheet');
	};

	onWizardMode = (mode) => {
		this.props.callback(['wizardMode', mode]);
	};

	onShowWelcome = (show) => {
		this.props.callback(['showWelcome', show]);
	};

	onReset = () => {
		this.props.callback(['cohortReset']);
	};

	onResetSampleFilter = () => {
		this.props.callback(['sampleFilter', null]);
	};

	onNavigate = (page) => {
		this.props.callback(['navigate', page]);
	};

	onImport = (content) => {
		try {
			this.props.callback(['import', schemaCheckThrow(JSON.parse(content))]);
		} catch (err) {
			this.props.callback(['import-error']);
		}
	};

	// XXX Change state to appState in Application, for consistency.
	render() {
		let {state, selector, callback} = this.props,
			{stateError} = state,
			computedState = selector(state),
			{spreadsheet: {mode}, loadPending} = computedState,
			stepperState = getStepperState(computedState),
			View = {
				heatmap: SpreadsheetContainer,
				chart: ChartView
			}[mode];
		return (
			<Application
					onReset={this.onReset}
					onResetSampleFilter={this.onResetSampleFilter}
					onWizardMode={this.onWizardMode}
					onShowWelcome={this.onShowWelcome}
					stepperState={stepperState}
					Spreadsheet={SpreadsheetContainer}
					onHighlightChange={this.on.highlightChange}
					sampleFormat={this.sampleFormat}
					getState={this.getState}
					onNavigate={this.onNavigate}
					onImport={this.onImport}
					loadPending={loadPending}
					stateError={stateError}
					state={computedState.spreadsheet}
					callback={callback}>
				<View
					stepperState={stepperState}
					searching={this.highlight}
					fieldFormat={this.fieldFormat}
					sampleFormat={this.sampleFormat}
					appState={computedState.spreadsheet}
					wizard={computedState.wizard}
					callback={callback}/>
			</Application>);
	}
}

module.exports = ApplicationContainer;
