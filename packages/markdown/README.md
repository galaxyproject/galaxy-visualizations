# Galaxy Visualization: Markdown Viewer

This package renders `markdown` datasets in Galaxy as formatted text, using [markdown-it](https://github.com/markdown-it/markdown-it). Raw HTML in the dataset is shown as text and the output is sanitised with [DOMPurify](https://github.com/cure53/DOMPurify), because visualizations run in the same origin as Galaxy.

## Development

To run the development server with the sample in `test-data/1.md`, use the following commands:

```bash
npm install
npm run dev
```

Set `GALAXY_ROOT`, `GALAXY_KEY` and `GALAXY_DATASET_ID` to render a dataset from a running Galaxy instead.

## Production

To build the production version, use the following command:

```bash
npm run build
```

## Tests

```bash
npm test
```

## License

This project is licensed under the MIT License.
