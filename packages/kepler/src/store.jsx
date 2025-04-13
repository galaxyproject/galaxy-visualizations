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
import { processGeojson } from "@kepler.gl/processors";
import thunk from "redux-thunk";

// Step 1: Build a simple GeoJSON dataset
const geojson = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [-122.4194, 37.7749], // San Francisco
            },
            properties: {
                name: "Startup Point",
            },
        },
    ],
};

const processed = processGeojson(geojson);

const dataset = {
    info: {
        label: "Startup Dataset",
        id: "startup-dataset",
    },
    data: processed,
};

// Step 2: Build base reducer state
const baseState = {
    mapState: mapStateReducer(undefined, { type: "@@INIT" }),
    mapStyle: mapStyleReducer(undefined, { type: "@@INIT" }),
    uiState: uiStateReducer(undefined, { type: "@@INIT" }),
    visState: visStateReducer(undefined, { type: "@@INIT" }),
};

// Step 3: Use internal updater to generate fully initialized Kepler instance state
const preloadedMapState = combinedUpdaters.addDataToMapUpdater(baseState, {
    payload: {
        datasets: dataset,
        options: {
            centerMap: true,
            readOnly: false,
        },
    },
});

// Step 4: Use the state in the Kepler reducer, mounted at ID "map"
const customizedKeplerReducer = keplerGlReducer.initialState({
    uiState: {
        currentModal: null
    },
    map: preloadedMapState,
});

// Step 5: Build full Redux store
const reducers = combineReducers({
    keplerGl: customizedKeplerReducer,
});

const middlewares = enhanceReduxMiddleware([thunk]);

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const store = createStore(reducers, {}, composeEnhancers(applyMiddleware(...middlewares)));

export default store;
