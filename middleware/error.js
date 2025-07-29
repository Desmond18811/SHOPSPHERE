const errorHandler = (err, req, res, next) => {
    // Log the full error stack trace to the console for debugging
    console.error(err.stack);

    // Set default status code; if response status is 200 but an error occurred, use 500
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    // Prepare the response object
    const response = {
        status: 'error', // Indicate an error occurred
        statusCode, // Use the determined status code
        message: err.message || 'Internal Server Error', // Default message if none provided
    };

    // Include the error stack trace only in development mode for debugging purposes
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack; // Add stack trace to response
    }

    // Send the error response as JSON
    res.status(statusCode).json(response);
};

// Export the error handler for use in app.js
export default errorHandler;