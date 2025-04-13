import { createStore, combineReducers, applyMiddleware, compose } from "redux";
import {
    keplerGlReducer,
    visStateReducer,
    uiStateReducer,
    mapStateReducer,
    mapStyleReducer,
    combinedUpdaters,
    enhanceReduxMiddleware,
} from "@kepler.gl/reducers";
import thunk from "redux-thunk";
import {KeplerGlSchema} from '@kepler.gl/schemas';

function storeFactory(dataset, config) {
    // Validate and parse config for v3.11
    const parsedConfig = config ? KeplerGlSchema.parseSavedConfig({
        version: "v1",
        config,
    }) : null;

    // Build base reducer state
    const baseState = {
        mapState: mapStateReducer(undefined, { type: "@@INIT" }),
        mapStyle: mapStyleReducer(undefined, { type: "@@INIT" }),
        uiState: uiStateReducer(undefined, { type: "@@INIT" }),
        visState: visStateReducer(undefined, { type: "@@INIT" }),
    };

    // Use internal updater to generate fully initialized Kepler instance state
    const preloadedMapState = combinedUpdaters.addDataToMapUpdater(baseState, {
        payload: {
            datasets: [dataset],
            options: {
                centerMap: true,
                readOnly: false,
            },
            config: parsedConfig,
        },
    });
    console.log(parsedConfig);

    // Use the state in the Kepler reducer, mounted at ID "map"
    const customizedKeplerReducer = keplerGlReducer.initialState({
        uiState: {
            currentModal: null,
        },
        map: preloadedMapState,
    });

    // Build full Redux store
    const reducers = combineReducers({
        keplerGl: customizedKeplerReducer,
    });

    const middlewares = enhanceReduxMiddleware([thunk]);
    const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
    return createStore(reducers, {}, composeEnhancers(applyMiddleware(...middlewares)));
}

export default storeFactory;
