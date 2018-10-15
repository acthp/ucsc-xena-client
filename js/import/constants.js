'use strict';

const DATA_TYPE = {
	PHENOTYPE: 'phenotype',
	MUTATION_BY_POS: 'mutation',
	SEGMENTED_CN: 'segmented',
	GENOMIC: 'genomic'
};

const dataSubType = {
	phenotype: 'phenotype',
	mutation: 'mutation',
	segmented: 'other',
	genomic: 'other'
};

const FILE_FORMAT = {
	CLINICAL_MATRIX: 'clinicalMatrix',
	GENOMIC_MATRIX: 'genomicMatrix',
	MUTATION_VECTOR: 'mutationVector',
	GENOMIC_SEGMENT: 'genomicSegment'
};

const dataTypesOpts = [
	{
		label: '',
		value: ''
	},
	{
		label: 'phenotype/clinical/sample type',
		value: DATA_TYPE.PHENOTYPE
	},
	{
		label: 'Genomic data: numbers in a rectangle (e.g. expression)',
		value: DATA_TYPE.GENOMIC
	},
	{
		label: 'Segmented data: (e.g. segmented copy number data)',
		value: DATA_TYPE.SEGMENTED_CN
	},
	{
		label: 'Positional data: (e.g. positional mutation data)',
		value: DATA_TYPE.MUTATION_BY_POS
	}
];

const PAGES = {
	FILE: 0,
	DATA_TYPE_SELECT: 1,
	DENSE_ORIENTATION: 2,
	STUDY: 3,
	PROBE: 4,
	ASSEMBLY: 5,
	PROGRESS: 6
};

const steps = [
	{ label: 'Select a Data File' },
	{ label: 'Add Data Details' },
	{ label: 'Load Data' }
];

const NONE_STR = 'None of these';

module.exports = {
	dataTypeOptions: dataTypesOpts,
	dataSubType,
	steps,
	NONE_STR,
	DATA_TYPE,
	FILE_FORMAT,
	PAGES,
};
