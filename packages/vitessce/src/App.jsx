import { Vitessce } from "vitessce";

function App({ spec }) {
    return (
        <>
            <Vitessce config={spec} theme="light" />
        </>
    );
}

export default App;
