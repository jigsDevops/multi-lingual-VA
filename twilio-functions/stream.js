const WebSocket = require('ws');
const axios = require('axios');

exports.handler = async (context, event, callback) => {
  const joinUrl = event.joinUrl; // URL for the WebSocket connection (e.g., from Ultravox)
  let transcript = '';
  let detectedLanguage = 'en'; // Default language
  let finalSentimentScore = 0; // Accumulate or track sentiment
  let sentimentCount = 0;

  console.log(`Attempting to connect WebSocket to: ${joinUrl}`);
  const ws = new WebSocket(joinUrl);

  ws.on('open', () => {
    console.log('WebSocket connection opened.');
    // You might need to send an initial message if the service requires it
    // ws.send(JSON.stringify({ action: 'start', ... }));
  });

  ws.on('message', async (data) => {
    try {
      const messageString = data.toString(); // Ensure data is a string
      console.log('WebSocket message received:', messageString);
      const response = JSON.parse(messageString);

      // Append to transcript (adjust based on actual response structure)
      if (response.input) transcript += `Caller: ${response.input}\n`;
      if (response.text) transcript += `Receptionist: ${response.text}\n`; // Assuming 'text' is the agent's response

      // Update detected language if provided
      if (response.detectedLanguage) {
        detectedLanguage = response.detectedLanguage;
      }

      // Perform sentiment analysis on user input if available
      if (response.input && context.GOOGLE_API_KEY) {
        try {
          const sentimentResponse = await axios.post(
            `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${context.GOOGLE_API_KEY}`, // Use API Key for Functions if not using Bearer token
            {
              document: { content: response.input, type: 'PLAIN_TEXT' },
              encodingType: 'UTF8'
            }
            // If using Bearer token (e.g., from gcloud auth print-access-token):
            // { headers: { Authorization: `Bearer ${context.GOOGLE_ACCESS_TOKEN}` } }
          );
          if (sentimentResponse.data && sentimentResponse.data.documentSentiment) {
             console.log('Sentiment score:', sentimentResponse.data.documentSentiment.score);
             finalSentimentScore += sentimentResponse.data.documentSentiment.score;
             sentimentCount++;
          }
        } catch (sentimentError) {
          console.error('Error analyzing sentiment:', sentimentError.response ? sentimentError.response.data : sentimentError.message);
          // Decide how to handle sentiment error (e.g., default to neutral)
        }
      }
    } catch (parseError) {
      console.error('Error parsing WebSocket message:', parseError);
      console.error('Received data:', data.toString()); // Log the raw data
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    // Decide if the function should terminate with an error
    // callback(error); // This might terminate the function prematurely
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);

    // Determine final sentiment category
    let sentiment = 'neutral';
    if (sentimentCount > 0) {
        const avgScore = finalSentimentScore / sentimentCount;
        if (avgScore > 0.2) sentiment = 'positive'; // Adjust thresholds as needed
        else if (avgScore < -0.2) sentiment = 'negative';
    }

    // Extract the last agent response (simple approach, might need refinement)
    const lastAgentResponse = transcript.trim().split('\nReceptionist: ').pop().split('\n')[0];

    console.log('Final Transcript:', transcript);
    console.log('Final Sentiment:', sentiment);
    console.log('Detected Language:', detectedLanguage);

    // Return the results via callback
    // IMPORTANT: Structure this payload based on how the calling service (e.g., Twilio Studio) expects it.
    callback(null, {
        text: lastAgentResponse, // Or maybe the full transcript is needed elsewhere?
        transcript: transcript,
        sentiment: sentiment,
        detectedLanguage: detectedLanguage
        // Add any other relevant data needed by the next step in your flow
    });
  });
};
