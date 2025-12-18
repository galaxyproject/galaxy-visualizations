export default function determineHyPhyMethod(json) {
    if (json == "" || json == undefined || json == null) {
        return null;
    }
    if (json["analysis"] != undefined) {
        const analysisString = json["analysis"]["info"];
        if (analysisString.includes("aBSREL")) {
            return "absrel";
        } else if (analysisString.includes("BGM")) {
            return "bgm";
        } else if (analysisString.includes("BUSTED")) {
            return "busted";
        } else if (analysisString.includes("FADE")) {
            return "fade";
        } else if (analysisString.includes("FEL")) {
            return "fel";
        } else if (analysisString.includes("FADE")) {
            return "fade";
        } else if (analysisString.includes("FUBAR")) {
            return "fubar";
        } else if (analysisString.includes("GARD")) {
            return "gard";
        } else if (analysisString.includes("MEME")) {
            return "meme";
        } else if (analysisString.includes("RELAX")) {
            return "relax";
        } else if (analysisString.includes("SLAC")) {
            return "slac";
        } else {
            return null;
        }
    } else if (json["breakpointData"] != undefined) {
        return "gard";
    } else if (json["compartments"] != undefined) {
        return "slatkin";
    }
    return null;
}
