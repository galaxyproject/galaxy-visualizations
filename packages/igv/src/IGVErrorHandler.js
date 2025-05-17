// Error handler for Galaxy-specific errors
export class IGVErrorHandler {
    static displayError(container, error) {
        // Clear any existing content
        container.innerHTML = "";

        const errorDiv = document.createElement("div");
        errorDiv.className = "igv-galaxy-error";
        errorDiv.style.cssText = `
            background: #f8d7da;
            color: #721c24;
            padding: 20px;
            border-radius: 4px;
            margin: 20px;
            border: 1px solid #f5c6cb;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        const message = this.getUserMessage(error);

        errorDiv.innerHTML = `
            <h3 style="margin-top: 0; color: #721c24;">Visualization Error</h3>
            <p style="margin: 10px 0;">${message}</p>
            ${this.getActionButtons(error)}
            <details style="margin-top: 15px; font-size: 0.9em;">
                <summary style="cursor: pointer;">Technical Details</summary>
                <pre style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow-x: auto;">${this.getErrorDetails(error)}</pre>
            </details>
        `;

        container.appendChild(errorDiv);
    }

    static getUserMessage(error) {
        // Check for HTTP status codes
        if (error.status === 404) {
            return "Dataset not found or access denied.";
        } else if (error.status === 403) {
            return "You do not have permission to view this dataset. Please check with the dataset owner.";
        } else if (error.status === 401) {
            return "You need to be logged in to view this dataset.";
        } else if (error.status >= 500) {
            return "The server encountered an error. Please try again later or contact support.";
        }

        // Check for specific error messages
        const message = error.message || error.toString();

        if (message.includes("Unknown genome")) {
            return "The reference genome for this dataset is not recognized by IGV. Please check the dataset's genome build setting.";
        } else if (message.includes("Failed to parse")) {
            return "The dataset format could not be parsed. Please ensure the file is valid and not corrupted.";
        } else if (message.includes("network") || message.includes("fetch")) {
            return "Network error: Unable to load the dataset. Please check your connection and try again.";
        } else if (message.includes("memory") || message.includes("too large")) {
            return "The dataset is too large to display. Try viewing a smaller region or using a different visualization.";
        }

        // Generic message
        return `An error occurred while loading the visualization: ${message}`;
    }

    static getActionButtons(error) {
        const buttons = [];

        // Reload button for temporary errors
        if (error.status >= 500 || error.message?.includes("network")) {
            buttons.push(`
                <button onclick="location.reload()" style="
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-right: 10px;
                ">Reload Page</button>
            `);
        }

        // Back to dataset button
        buttons.push(`
            <button onclick="window.history.back()" style="
                background: #6c757d;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            ">Back to Dataset</button>
        `);

        return buttons.length > 0 ? `<div style="margin-top: 15px;">${buttons.join("")}</div>` : "";
    }

    static getErrorDetails(error) {
        const details = {
            message: error.message,
            type: error.constructor.name,
            status: error.status,
            timestamp: new Date().toISOString(),
        };

        if (error.stack) {
            details.stack = error.stack;
        }

        if (error.response) {
            details.response = {
                status: error.response.status,
                statusText: error.response.statusText,
                url: error.response.url,
            };
        }

        return JSON.stringify(details, null, 2);
    }

    static logError(context, error) {
        console.error(`[IGV-Galaxy] Error in ${context}:`, error);

        // Could send to Galaxy error tracking if available
        if (window.Galaxy?.logging?.logError) {
            window.Galaxy.logging.logError({
                component: "igv-visualization",
                context: context,
                error: {
                    message: error.message,
                    stack: error.stack,
                    status: error.status,
                },
            });
        }
    }
}
