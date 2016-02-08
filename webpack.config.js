/*global require: false, module: false, __dirname: false */
'use strict';
var HtmlWebpackPlugin = require('html-webpack-plugin');
var webpack = require('webpack');

function babelTarget(path) {
	return path.indexOf('node_modules') === -1 || path.indexOf('ucsc-xena-datapages') !== -1;
}

module.exports = {
	historyApiFallback: true,
	entry: "./js/bogorouter",
	output: {
		path: __dirname + "/build",
		publicPath: "/",
		filename: "[name].js"
	},
	module: {
		loaders: [
			{ test: /rx-dom/, loader: "imports?define=>false" },
			{ test: /\.js$/, include: babelTarget, loaders: ['babel-loader'], type: 'js'},
			{ test: /\.css$/, loader: "style!css" },
			{ test: /\.(jpe?g|png|gif|svg|eot|woff2?|ttf)$/i, loaders: ['url?limit=10000'] }
		]
	},
	plugins: [
		new HtmlWebpackPlugin({
			title: "UCSC Xena",
			filename: "index.html",
			template: "page.template"
		}),
		new webpack.OldWatchingPlugin()
	],
	resolve: {
		alias: {
			rx$: 'rx/dist/rx',
			'rx.binding$': 'rx/dist/rx.binding',
			'rx.async$': 'rx/dist/rx.async',
			'rx.experimental$': 'rx/dist/rx.experimental',
			'rx.coincidence$': 'rx/dist/rx.coincidence'
		},
		extensions: ['', '.js', '.json', '.coffee'],
		root: __dirname + "/js"
	}
};
