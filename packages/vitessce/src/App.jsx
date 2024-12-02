import { Vitessce } from "vitessce";

function App({ datasetContent }) {
    return (
        <>
            <Vitessce config={datasetContent} theme="light" />
        </>
    );
}

export default App;
