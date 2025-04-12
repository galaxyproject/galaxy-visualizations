// store.js
import { createStore, combineReducers, applyMiddleware, compose } from "redux";
import { keplerGlReducer, enhanceReduxMiddleware } from "@kepler.gl/reducers";
import thunk from "redux-thunk";

const KEPLER_REDUCER_KEY = 'keplerGl'; // Use a constant to prevent typos

const reducers = combineReducers({
    [KEPLER_REDUCER_KEY]: keplerGlReducer,
});

const middlewares = enhanceReduxMiddleware([thunk]);

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const store = createStore(
    reducers,
    {}, 
    composeEnhancers(applyMiddleware(...middlewares))
);

// Freeze the reducer key to prevent modification
Object.defineProperty(store.getState(), KEPLER_REDUCER_KEY, {
    writable: false,
    configurable: false
});

export default store;