/*eslint camelcase: 0, no-use-before-define: 0 */
// Config UI for custom viz settings for heatmaps.
//
// State schema. This is the goal, not the current implementation. If
// the user has never modified the default settings, vizSettings is undefined.
//
// When the user modifies colNormalization or color parameters, they are
// written into vizSettings. vizSettings can have normalization or color
// parameters, or both. All color parameters are present if any are set.
// The minStart/maxStart are optional, so may be null if other color parameters
// are set.
//
// vizSettings = undefined |
//               {
//                 colNormalization: 'subset' | 'none'
//               } |
//               {
//                 min: float,
//                 minStart: float | null,
//                 maxStart: float | null,
//                 max: float
//               } |
//               {
//                 colNormalization: 'subset' | 'none'
//                 min: float,
//                 minStart: float | null,
//                 maxStart: float | null,
//                 max: float
//               }

// Refactoring notes:
// The default column normalization is fetched from the server. Instead it should come from
// the state, or from a data cache, because we've fetched that already.

'use strict';
var _ = require('../underscore_ext');
//var floatImg = require('../../images/genomicFloatLegend.jpg');
var customFloatImg = require('../../images/genomicCustomFloatLegend.jpg');
var React = require('react');
var ReactDOM = require('react-dom');
var {DropdownButton, MenuItem, Button, ButtonToolbar, ButtonGroup} = require('react-bootstrap/lib/');
var {Row, Col} = require("react-material-responsive-grid");
var Input = require('react-bootstrap/lib/Input');
var image = require('react-bootstrap/lib/Image');
import Dialog from 'react-toolbox/lib/dialog';
import vizSettingStyle from "./vizSetting.module.css";

function vizSettingsWidget(node, onVizSettings, vizState, id, hide, defaultNormalization,
	defaultColorClass, valueType, fieldType, data, units) {
	var state = vizState;
	function datasetSetting() {
		var node, div = document.createElement("div");
		if (valueType === "float" || valueType === 'segmented') {
			node = document.createElement("div");
			allFloat(node);
			div.appendChild(node);
		}
		else if (valueType === "mutation" && fieldType === 'SV') {
			node = document.createElement("div");
			sv(node);
			div.appendChild(node);
		} else {
			div.appendChild(document.createTextNode("No setting adjustments available."));
			div.appendChild(document.createElement("br"));
			div.appendChild(document.createElement("br"));
		}
		node = document.createElement("span");
		ReactDOM.render(React.createElement(finishButtonBar), node);
		div.appendChild(node);
		return div;
	}

	function allFloat(div) {
		var node;

		// color palette : green red or blue red
		node = document.createElement("div");
		ReactDOM.render(React.createElement(colorDropDown), node);
		div.appendChild(node);
		div.appendChild(document.createElement("br"));

		// color mode
		node = document.createElement("div");
		ReactDOM.render(React.createElement(scaleChoice), node);
		div.appendChild(node);
		div.appendChild(document.createElement("br"));
	}

	function sv(div) {
		var node;
		// color choice
		node = document.createElement("div");
		ReactDOM.render(React.createElement(svColorDropDown), node);
		div.appendChild(node);
		div.appendChild(document.createElement("br"));
	}

	// discard user changes & close.
	class finishButtonBar extends React.Component {
	    handleCancelClick = () => {
			hide();
			onVizSettings(id, state);
		};

	    handleDoneClick = () => {
			hide();
		};

	    render() {
			return (
				<ButtonToolbar>
					<Button onClick = {this.handleCancelClick}>Cancel</Button>
					<Button bsStyle="primary" onClick = {this.handleDoneClick}>Done</Button>
				</ButtonToolbar>
			);
		}
	}

	function getInputSettingsFloat(settings) {
		return _.fmap(settings, parseFloat);
	}

	var validateSettings = {
		float: s => {
			var vals = _.fmap(s, parseFloat),
				fmtErrors = _.fmap(vals, function (v, k) {
					return (isNaN(v) && s[k]) ? "Invalid number." : "";
				}),
				missing = _.fmap(s, _.constant(null)),
				rangeErrors;

			/*jshint -W018 */ /* allow xor idiom */
			if (!s.minStart !== !s.maxStart) { // xor
				missing.minStart = 'Both 0% values must be given to take effect.';
			}
			// XXX check for missin min & max

			if (s.minStart && s.maxStart && !fmtErrors.minStart && !fmtErrors.maxStart) {
				// wrong if missing maxStart: we compare against the wrong thing.
				rangeErrors = {
					max: null,
					maxStart: vals.maxStart <= vals.max ? null :  'Should be lower than max',
					minStart: vals.minStart <= vals.maxStart ? null : 'Should be lower than maxStart',
					min: vals.min <= vals.minStart ? null : 'Should be lower than minStart'
				};
			} else {
				rangeErrors = {
					max: null,
					min: vals.min <= vals.max ? null : 'Should be lower than max'
				};
			}

			return _.fmap(fmtErrors, function (err, k) {
				return _.filter([err, rangeErrors[k], missing[k]], _.identity).join(' ');
			});
		},
		segmented: s => {
			var vals = _.fmap(s, parseFloat),
				fmtErrors = _.fmap(vals, v => {
					return isNaN(v) ? "Invalid number." : "";
				}),
				rangeErrors = {
					thresh: vals.thresh >= 0 ? null : 'Should be positive',
					max: vals.max >= 0 ? null : 'Should be positive'
				};
			return _.fmap(fmtErrors, function (err, k) {
				return _.filter([err, rangeErrors[k]], _.identity).join(' ');
			});
		}
	};

	function settingsValid(errors) {
		return _.every(errors, function (s) { return !s; });
	}

	function valToStr(v) {
//		return "" + v;
//		if (v === "-") {
//			return v;
//		}
		return (!isNaN(v) && (v !== null) && (v !== undefined)) ? "" + v : "";
	}

	var scaleAnnotations = {
		float: {
			"max": "max: high color 100% saturation",
			"maxStart": "maxStart: high color 0% saturation",
			"minStart": "minStart: low color 0% saturation",
			"min": "min: low color 100% saturation"
		},
		segmented: {
			"origin": "Origin: value for copy number normal (typically: 0 or 2)",
			"thresh": "Threshold: absolute value from origin to start showing color",
			"max": "Saturation: absolute value to draw full color"
		}
	};
	var scaleDefaults = {
		float: {
			max: 1,
			maxStart: null,
			minStart: null,
			min: -1
		},
		segmented: {
			origin: 0,
			thresh: 0,
			max: 1
		}
	};

	class scaleChoice extends React.Component {
	    constructor(props) {
	        super(props);
	        //check if there is custom value
	        let custom = colorParams[valueType].some(function (param) {
					if (getVizSettings(param)) {
						return true;
					}
				}),
				dataMin, dataMax;

	        if (valueType === "float") {
				dataMin = _.minnull(_.map(data.req.values, values => _.minnull(values)));
				dataMax = _.maxnull(_.map(data.req.values, values => _.maxnull(values)));
				scaleDefaults[valueType].min = dataMin;
				scaleDefaults[valueType].max = dataMax;
			} else if (valueType === 'segmented') {
				dataMin = _.minnull(_.map(data.req.rows, row => row.value));
				dataMax = _.maxnull(_.map(data.req.rows, row => row.value));
				if (dataMin >= 0) {
					scaleDefaults[valueType].origin = 2;
					scaleDefaults[valueType].max = 6;
				} else {
					scaleDefaults[valueType].origin = 0;
					scaleDefaults[valueType].max = dataMax;
				}
			}

	        this.state = {
				mode: custom ? "Custom" : "Auto",
				settings: custom ? _.pick(oldSettings, colorParams[valueType]) : scaleDefaults[valueType],
				errors: {}
			};
	    }

	    autoClick = () => {
			this.setState({mode: "Auto"});
			this.setState({errors: {}});
			onVizSettings(id, _.omit(currentSettings.state, colorParams[valueType]));
		};

	    customClick = () => {
			this.setState({mode: "Custom"});
			onVizSettings(id, _.merge(currentSettings.state, getInputSettingsFloat(this.state.settings)));
		};

	    onScaleParamChange = (ev) => {
			var {settings} = this.state,
				param = ev.target.getAttribute('data-param'),
				newSettings = _.assoc(settings, param, ev.target.value),
				errors = validateSettings[valueType](newSettings);

			this.setState({settings: newSettings, errors});

			if (settingsValid(errors)) {
				onVizSettings(id, _.merge(currentSettings.state, getInputSettingsFloat(newSettings)));
			}
		};

	    buildCustomColorScale = () => {
			var node = colorParams[valueType].map(param => {
					let value = valToStr(this.state.settings[param]),
						label = scaleAnnotations[valueType][param],
						error = this.state.errors[param];

					return (
						<Row>
							<Col xs4={4} xs8={8} sm={6} smOffset={6}>
								<label bsStyle="danger">{error}</label>
							</Col>
							<Col xs4={4} xs8={4} sm={6}>{label}</Col>
							<Col xs4={4} xs8={4} sm={6}>
								<Input type='textinput' placeholder={_.contains(['minThresh', 'maxThresh'], param) ? 'Auto' : ''}
									value={value} data-param={param} onChange={this.onScaleParamChange}/>
							</Col>
						</Row>
					);
				});
			return node;
		};

	    render() {
			let mode = this.state.mode,
				autoMode = (this.state.mode === "Auto"),
				modes = ["Auto", "Custom"],
				funcMapping = {
					"Auto": this.autoClick,
					"Custom": this.customClick
				},
				buttons = modes.map(mode => {
					let active = (this.state.mode === mode),
						func = funcMapping[mode];
					return active ? (<Button bsStyle="primary" onClick={func} active>{mode}</Button>) :
						(<Button onClick={func}>{mode}</Button>);
				}),
				picture = autoMode ? null : (<image src={customFloatImg} responsive/>),
				enterInput = autoMode ? null : this.buildCustomColorScale(),
				autocolorTransformation = (valueType === "float" && fieldType !== 'clinical') ?
					React.createElement(normalizationDropDown) :
					(valueType === 'segmented' ? React.createElement(segCNVnormalizationDropDown) : null),
				notransformation = (
				    <Row>
						<Col xs4={4} xs8={3} sm={3}>Color transformation</Col>
						<Col xs4={4} xs8={5} sm={9}>no transformation</Col>
					</Row>
				),
				colorTransformation = autoMode ? autocolorTransformation : notransformation;

			return (
				<div>
					<Row>
						<Col xs4={4} xs8={3} sm={3}>Mode</Col>
						<Col xs4={4} xs8={5} sm={9}>
							<ButtonGroup>{buttons}</ButtonGroup>
							<div>
								{picture}
								{enterInput}
							</div>
						</Col>
					</Row>
					<br/>
					{colorTransformation}
				</div>
			);
		}
	}

	function setVizSettings(key, value) {
		onVizSettings(id, _.assoc(currentSettings.state, key, value));
	}

	function getVizSettings(key) {
		return _.getIn(state, [key]);
	}

	//color transformation for dense genomics matrix floats
	class normalizationDropDown extends React.Component {
	    constructor(props) {
	        super(props);
	        let	value = getVizSettings('colNormalization') || defaultNormalization || 'none',
				mapping = {
					"none": "none",
					"subset": "subset",
					"log2(x)": "log2(x)",
					true: "subset"
				};

	        this.state = {
				optionValue: mapping[value] || "none"
			};
	    }

	    handleSelect = (evt, evtKey) => {
			var key = "colNormalization";
			setVizSettings(key, evtKey);
			this.setState({optionValue: evtKey});
		};

	    render() {
			let dataMin = _.minnull(_.map(data.req.values, values => _.minnull(values))),
				optionValue = this.state.optionValue,
				options = [
					{"key": "none", "label": "none"},
					{"key": "subset", "label": "center by column mean : x - column average"},
				];
			if (dataMin >= 0 && !(_.any(units, unit => unit && unit.search(/log/i) !== -1))) {
				// we allow log(0), necessary for RNAseq data, value =0 (no expression is very common).
				// display can handle this
				options.push({"key": "log2(x)", "label": "log scale : log2(x+1)"});
			}


			var	activeOption = _.find(options, obj => {
					return obj.key === optionValue;
				}),
				title = activeOption ? activeOption.label : 'Select',
				menuItemList = options.map(obj => {
					var active = (obj.key === optionValue);
					return active ? (<MenuItem eventKey={obj.key} active>{obj.label}</MenuItem>) :
						(<MenuItem eventKey={obj.key}>{obj.label}</MenuItem>);
				});
			return (
				<Row>
					<Col xs4={4} xs8={3} sm={3}>Color transformation</Col>
					<Col xs4={4} xs8={5} sm={9}>
						<DropdownButton title={title} onSelect={this.handleSelect} >
							{menuItemList}
						</DropdownButton>
					</Col>
				</Row>
			);
		}
	}

	//color transformation for segmented cnv
	class segCNVnormalizationDropDown extends React.Component {
	    constructor(props) {
	        super(props);
	        let	value = getVizSettings('colNormalization') || defaultNormalization || 'none',
				mapping = {
					"none": "none",
					"normal2": "normal2",
				};

	        this.state = {
				optionValue: mapping[value] || "none"
			};
	    }

	    handleSelect = (evt, evtKey) => {
			var key = "colNormalization";
			setVizSettings(key, evtKey);
			this.setState({optionValue: evtKey});
		};

	    render() {
			let optionValue = this.state.optionValue,
				options = [
					{"key": "none", "label": "normal = 0"},
					{"key": "normal2", "label": "normal = 2" },
				],
				activeOption = _.find(options, obj => {
					return obj.key === optionValue;
				}),
				title = activeOption ? activeOption.label : 'Select',
				menuItemList = options.map(obj => {
					var active = (obj.key === optionValue);
					return active ? (<MenuItem eventKey={obj.key} active>{obj.label}</MenuItem>) :
						(<MenuItem eventKey={obj.key}>{obj.label}</MenuItem>);
				});
			return (
				<Row>
					<Col xs4={4} xs8={3} sm={3}>Color transformation</Col>
					<Col xs4={4} xs8={5} sm={9}>
						<DropdownButton title={title} onSelect={this.handleSelect} >
							{menuItemList}
						</DropdownButton>
					</Col>
				</Row>
			);
		}
	}

	//color palette dense matrix floats and segmented CNV
	class colorDropDown extends React.Component {
	    constructor(props) {
	        super(props);
	        let	value = getVizSettings('colorClass') || 'default';

	        this.state = {
				optionValue: value
			};
	    }

	    handleSelect = (evt, evtKey) => {
			var key = "colorClass";
			setVizSettings(key, evtKey);
			this.setState({optionValue: evtKey});
		};

	    render() {
			let optionValue = this.state.optionValue,
				options = {
					float: [
						{"key": "default", "label": "red-white-blue"},
						{"key": "expression", "label": "red-black-green"},
						{"key": "blueBlackYellow", "label": "yellow-black-blue"},
						{"key": "whiteBlack", "label": "black-white"}
					],
					segmented: [
						{"key": "default", "label": "red-white-blue"},
						{"key": "expression", "label": "red-white-green"},
						{"key": "blueBlackYellow", "label": "yellow-white-blue"}
					],
				},
				activeOption = _.find(options[valueType], obj => {
					return obj.key === optionValue;
				}),
				title = activeOption ? activeOption.label : 'Select',
				menuItemList = options[valueType].map(obj => {
					var active = (obj.key === optionValue);
					return active ? (<MenuItem eventKey={obj.key} active>{obj.label}</MenuItem>) :
						(<MenuItem eventKey={obj.key}>{obj.label}</MenuItem>);
				});
			return (
				<Row>
					<Col xs4={4} xs8={3} sm={3}>Color palette</Col>
					<Col xs4={4} xs8={5} sm={9}>
						<DropdownButton title={title} onSelect={this.handleSelect} >
							{menuItemList}
						</DropdownButton>
					</Col>
				</Row>
			);
		}
	}

	//color palette for SV
	class svColorDropDown extends React.Component {
	    constructor(props) {
	        super(props);
	        let	value = getVizSettings('svColor') || 'default';

	        this.state = {
				optionValue: value
			};
	    }

	    handleSelect = (evt, evtKey) => {
			var key = "svColor";
			setVizSettings(key, evtKey);
			this.setState({optionValue: evtKey});
		};

	    render() {
			let optionValue = this.state.optionValue,
				options = {
					SV: [
						{"key": "default", "label": "grey"},
						{"key": "chromosomeGB", "label": "by chromosome (Genome Browser)"},
						{"key": "chromosomePCAWG", "label": "by chromosome (PCAWG)"},
					]
				},
				activeOption = _.find(options[fieldType], obj => {
					return obj.key === optionValue;
				}),
				title = activeOption ? activeOption.label : 'Select',
				menuItemList = options[fieldType].map(obj => {
					var active = (obj.key === optionValue);
					return active ? (<MenuItem eventKey={obj.key} active>{obj.label}</MenuItem>) :
						(<MenuItem eventKey={obj.key}>{obj.label}</MenuItem>);
				});
			return (
				<Row>
					<Col xs4={4} xs8={3} sm={3}>Color palette</Col>
					<Col xs4={4} xs8={5} sm={9}>
						<DropdownButton title={title} onSelect={this.handleSelect} >
							{menuItemList}
						</DropdownButton>
					</Col>
				</Row>
			);
		}
	}

	var oldSettings = state,
		currentSettings = {state: state},
		colorParams = {
			float: ["max", "maxStart", "minStart", "min"],
			segmented: ["origin", "thresh", "max"]
		};

	node.appendChild(datasetSetting());
	return currentSettings;
}

// react wrapper for the legacy DOM code, above.
class SettingsWrapper extends React.Component {
	shouldComponentUpdate() {
		return false;
	}

	componentWillReceiveProps(newProps) {
		this.currentSettings.state = newProps.vizSettings;
	}

	componentDidMount() {
		var {refs: {content}, props: {data, units, onVizSettings, vizSettings, id, defaultNormalization, colorClass, valueType, fieldType, onRequestHide}} = this;
		this.currentSettings = vizSettingsWidget(content, onVizSettings, vizSettings, id, onRequestHide, defaultNormalization, colorClass, valueType, fieldType, data, units);
	}

	render() {
		return <div ref='content' />;
	}
}

class VizSettings extends React.Component {
	render() {
		var {onRequestHide} = this.props;

		const actions = [
			{
				label: <i className='material-icons'>close</i>,
				className: vizSettingStyle.dialogClose,
				onClick: onRequestHide
			},
		];

		return (
			<Dialog
				actions={actions}
				active={true}
				title='Dataset Visualization Settings'
				className={vizSettingStyle.dialog}
				onEscKeyDown={this.props.onHide}
				onOverlayClick={this.props.onHide}>
				<SettingsWrapper {...this.props} />
			</Dialog>
		);
	}
}

module.exports = VizSettings;
