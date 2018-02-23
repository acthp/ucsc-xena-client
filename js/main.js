'use strict';
import './base';
import _ from './underscore_ext';
import './plotDenseMatrix';
import './plotMutationVector';
import './plotSegmented';
import './plotSamples';
import './refGeneExons';
import './ChromPosition';
import './models/denseMatrix';
import './models/mutationVector';
import './models/segmented';
import 'bootstrap/dist/css/bootstrap.css';

import uiController from './controllers/ui';
import serverController from './controllers/server';
import hubController from './controllers/hub';
import transcriptController from './controllers/transcripts';
import PageContainer from './containers/PageContainer';
import selector from './appSelector';
import { compose } from './controllers/utils';
import { controller as shimComposite } from './controllers/shimComposite';

const connector = require('./connector');
const createStore = require('./store');
//var Application = require('./containers/ApplicationContainer');

// Hot load controllers. Note that hot loading won't work if one of the methods
// is captured in a closure or variable which we can't access.  References to
// the controller methods should only happen by dereferencing the module. That's
// currently true of the controllers/compose method, so we are able to hot
// load by overwritting the methods, here. However it's not true of devtools.
// If we had a single controller (i.e. no call to compose), passing a single
// controller to devtools would defeat the hot loading. Sol'n would be to
// update devtools to always dereference the controller, rather than keeping
// methods in closures.
// Rx streams in components are also a problem.

if (module.hot) {
	module.hot.accept('./controllers/ui', () => {
		let newModule = require('./controllers/ui');
		_.extend(uiController, newModule);
	});
	module.hot.accept('./controllers/server', () => {
		let newModule = require('./controllers/server');
        _.extend(serverController, newModule);
	});
	module.hot.accept('./controllers/hub', () => {
		let newModule = require('./controllers/hub');
        _.extend(hubController, newModule);
	});
	// XXX Note that hot-loading these won't cause a re-render.
	module.hot.accept('./models/mutationVector', () => {});
	module.hot.accept('./models/denseMatrix', () => {});
	module.hot.accept('./models/segmented', () => {});
}
const store = createStore();
const main = window.document.getElementById('main');

// XXX reducer
const controller = shimComposite(compose(serverController, uiController, hubController, transcriptController));

connector({...store, controller, main, selector, Page: PageContainer, persist: true, history: false});
