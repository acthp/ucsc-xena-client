/*global require: false, module: false */
'use strict';
var React = require('react');
var Select = require('./Select');
var _ = require('underscore_ext');
var xenaQuery = require('./xenaQuery');
var {deepPureRenderMixin} = require('./react-utils');

// group header for a server
var header = s => xenaQuery.server_url(s.server);
var filterStatusLoaded = list => list.filter(el => el.status === 'loaded');
var sortByLabel = list => _.sortBy(list, el => el.label.toLowerCase());

function moveLocalServer(servers) {
	let localDNS = 'local.xena.ucsc.edu',
		localServer = _.find(servers, server => server.server.includes(localDNS)),
		remoteServers = _.reject(servers, server => server.server.includes(localDNS));

	return [localServer].concat(remoteServers);
}

function optsFromDatasets(servers) {
	return _.flatmap(servers, (s) => {
		let sortedOpts = sortByLabel(filterStatusLoaded(s.datasets))
			.map(d => ({value: d.dsID, label: d.label}));
		return [{label: header(s), header: true}].concat(sortedOpts);
	});
}

var DatasetSelect = React.createClass({
	mixins: [deepPureRenderMixin],
	render: function () {
		var {datasets, nullOpt, ...other} = this.props,
			origServerList = _.getIn(datasets, ['servers']),
			servers = origServerList ? moveLocalServer(origServerList) : null,
			options = (nullOpt ? [{value: null, label: nullOpt}] : [])
				.concat(optsFromDatasets(servers));

		return (
			<Select {...other}  options={options} />
		);
	}
});

module.exports = DatasetSelect;
