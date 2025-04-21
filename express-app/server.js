const express = require('express');
const axios = require('axios');
const { Translate } = require('@google-cloud/translate').v2;
const { Pool } = require('pg');
const Redis = require('ioredis');
const chrono = require('chrono-node');
const admin = require('firebase-admin'); // For Firestore

// --- Configuration ---
// Load environment variables (using dotenv or similar is recommended)
require('dotenv').config();

const {
  PORT = 3000,
  GOOGLE_PROJECT_ID,
  DATABASE_URL,
  REDIS_URL,
  EASY_APPOINTMENTS_API_KEY,
  EASY_APPOINTMENTS_URL, // e.g., https://easyappointments.yourdomain.com
  FIREBASE_SERVICE_ACCOUNT, // Path to or JSON string of your service account key
  DEFAULT_APPOINTMENT_SERVICE_ID = 'default_service', // Default service ID for Easy!Appointments
  DEFAULT_APPOINTMENT_DURATION = 30, // Default duration in minutes
  ULTRAVOX_TTS_URL // e.g., https://ultravox.yourdomain.com/tts
} = process.env;

// --- Initialization ---
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware for form data (if needed)

// Initialize Google Translate Client
let translationClient;
if (GOOGLE_PROJECT_ID) {
  translationClient = new Translate({ projectId: GOOGLE_PROJECT_ID });
  console.log('Google Translate Client Initialized.');
} else {
  console.warn('GOOGLE_PROJECT_ID not set. Translation features disabled.');
}

// Initialize PostgreSQL Client
let db;
if (DATABASE_URL) {
  db = new Pool({ connectionString: DATABASE_URL });
  db.connect()
    .then(() => console.log('PostgreSQL Connected.'))
    .catch(err => console.error('PostgreSQL Connection Error:', err));
} else {
  console.warn('DATABASE_URL not set. Database features disabled.');
}

// Initialize Redis Client
let redis;
if (REDIS_URL) {
  redis = new Redis(REDIS_URL);
  redis.on('connect', () => console.log('Redis Connected.'));
  redis.on('error', err => console.error('Redis Connection Error:', err));
} else {
  console.warn('REDIS_URL not set. Caching features disabled.');
}

// Initialize Firebase Admin SDK
try {
  if (FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK Initialized.');
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set. Firebase features disabled.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
}
const firestore = admin.firestore();

// --- Helper Functions ---

/**
 * Mock Ultravox TTS function (replace with actual Ultravox API call)
 * @param {string} text - Text to synthesize
 * @param {string} language - Language code (e.g., 'en', 'es')
 * @returns {Promise<string>} - Promise resolving to the audio URL or identifier
 */
async function ultravoxTextToSpeech(text, language) {
  console.log(`[Mock TTS] Request: Text="${text}", Lang="${language}"`);
  if (!ULTRAVOX_TTS_URL) {
    console.warn("ULTRAVOX_TTS_URL not set. Returning placeholder TTS info.");
    return `placeholder_audio_for_${language}_${text.substring(0, 10)}.mp3`; // Placeholder
  }
  try {
    // Replace with actual API call structure for Ultravox
    const response = await axios.post(ULTRAVOX_TTS_URL, {
      text: text,
      language: language,
      // Add any other required parameters (voice model, format, etc.)
    });
    console.log(`[Mock TTS] Response:`, response.data);
    // Adjust based on the actual response structure from Ultravox
    return response.data.audio_url || response.data.audio_id || `error_getting_audio_url`;
  } catch (error) {
    console.error(`Error calling Ultravox TTS API:`, error.response ? error.response.data : error.message);
    // Fallback or error indicator
    return `error_generating_tts_${language}`;
  }
}

/**
 * Adds minutes to a time string (HH:MM).
 * @param {string} time - Time string (HH:MM)
 * @param {number} minutesToAdd - Minutes to add
 * @returns {string} - New time string (HH:MM)
 */
function addMinutesToTime(time, minutesToAdd) {
  try {
    const [hour, minute] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hour, minute + minutesToAdd, 0, 0); // Set hours and minutes
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); // Use 24-hour format consistently
  } catch (e) {
    console.error("Error adding minutes to time:", e);
    // Fallback: return original time + fixed duration (less ideal)
    const originalMinutes = parseInt(time.split(':')[1] || '0');
    const newMinutes = (originalMinutes + minutesToAdd) % 60;
    const hourIncrement = Math.floor((originalMinutes + minutesToAdd) / 60);
    const originalHour = parseInt(time.split(':')[0] || '0');
    const newHour = (originalHour + hourIncrement) % 24;
    return `${String(newHour).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  }
}

/**
 * Translates text using Google Cloud Translate.
 * @param {string} text - Text to translate.
 * @param {string} sourceLang - Source language code.
 * @param {string} targetLang - Target language code.
 * @returns {Promise<string>} - Translated text.
 */
async function translateText(text, sourceLang, targetLang) {
  if (!translationClient || !text || sourceLang === targetLang) {
    return text; // No translation needed or possible
  }
  try {
    const [translation] = await translationClient.translate(text, { from: sourceLang, to: targetLang });
    console.log(`Translated "${text}" (${sourceLang}) to "${translation}" (${targetLang})`);
    return translation;
  } catch (error) {
    console.error(`Error translating text from ${sourceLang} to ${targetLang}:`, error);
    return text; // Return original text on error
  }
}

// --- API Endpoint ---

app.post('/voice', async (req, res) => {
  console.log('Received /voice request:', JSON.stringify(req.body, null, 2));

  // --- 1. Extract Data ---
  // Adjust these based on the actual payload from SignalWire or your interaction service
  const phoneNumber = req.body.caller_id || req.body.From;
  const callId = req.body.call_id || req.body.CallSid;
  const duration = req.body.duration || req.body.CallDuration; // May not be final duration yet
  const speechResult = req.body.ultravox_transcription || req.body.SpeechResult; // User's speech input
  const interactionData = req.body.interaction_result; // Potential data from a prior step (like the /stream function)

  // Prioritize data from interaction_result if available
  let transcript = interactionData?.transcript || `Caller: ${speechResult || 'N/A'}\n`; // Build basic transcript if needed
  let detectedLanguage = interactionData?.detectedLanguage; // Language from interaction
  let sentiment = interactionData?.sentiment || 'neutral'; // Sentiment from interaction

  // --- 2. Validate Input ---
  if (!phoneNumber) {
    console.error('Missing caller_id/From in request.');
    // Cannot respond without knowing language, default to English error
    const response = await ultravoxTextToSpeech('An internal error occurred. Missing caller information.', 'en');
    return res.status(400).json({ voiceResponse: response });
  }

  // --- 3. Get Customer ---
  let customer;
  if (db) {
    try {
      const result = await db.query('SELECT id, email FROM customers WHERE phone_number = $1', [phoneNumber]);
      if (result.rows.length > 0) {
        customer = result.rows[0];
        console.log(`Found customer: ID=${customer.id}, Email=${customer.email}`);
      } else {
        console.log(`Customer not found for phone number: ${phoneNumber}`);
        const response = await ultravoxTextToSpeech('Sorry, we could not find your record in our system.', detectedLanguage || 'en');
        return res.json({ voiceResponse: response }); // Respond in detected language if possible
      }
    } catch (dbError) {
      console.error('Database error fetching customer:', dbError);
      const response = await ultravoxTextToSpeech('Sorry, we encountered a database error. Please try again later.', detectedLanguage || 'en');
      return res.status(500).json({ voiceResponse: response });
    }
  } else {
    console.warn('Database disabled. Skipping customer lookup.');
    // Proceed without customer context? Or return error? Depends on requirements.
    // For demo, let's assume a default customer email if DB is off
    customer = { id: 'demo_customer', email: 'demo@example.com' };
  }

  // --- 4. Detect Language (if not provided by interaction) ---
  if (!detectedLanguage && speechResult && translationClient) {
    const cacheKey = `lang:${speechResult}`;
    try {
      if (redis) {
        detectedLanguage = await redis.get(cacheKey);
        if (detectedLanguage) {
          console.log(`Language cache hit: ${detectedLanguage}`);
        }
      }
      if (!detectedLanguage) {
        const [detection] = await translationClient.detect(speechResult);
        detectedLanguage = Array.isArray(detection) ? detection[0].language : detection.language; // Handle potential array response
        const confidence = Array.isArray(detection) ? detection[0].confidence : detection.confidence;
        console.log(`Detected language: ${detectedLanguage} (Confidence: ${confidence})`);

        // TODO: Implement language confirmation logic if confidence is low
        // if (confidence < 0.8) { ... }

        if (redis && detectedLanguage) {
          await redis.set(cacheKey, detectedLanguage, 'EX', 3600); // Cache for 1 hour
          console.log(`Language cached: ${detectedLanguage}`);
        }
      }
    } catch (langError) {
      console.error('Error detecting language:', langError);
      detectedLanguage = 'en'; // Fallback to English
      console.log('Falling back to default language: en');
    }
  } else if (!detectedLanguage) {
    detectedLanguage = 'en'; // Fallback if no speech or no translation client
    console.log('Using default language: en');
  }

  // --- 5. Translate Input for Parsing (to English) ---
  let textToParse = speechResult;
  if (speechResult && detectedLanguage !== 'en') {
    textToParse = await translateText(speechResult, detectedLanguage, 'en');
  }

  // --- 6. Parse Appointment Time ---
  let appointmentStart;
  if (textToParse) {
    try {
      const results = chrono.parse(textToParse, new Date(), { forwardDate: true });
      if (results.length > 0) {
        appointmentStart = results[0].start.date();
        console.log(`Parsed appointment time (UTC): ${appointmentStart.toISOString()}`);
      } else {
        console.log(`Could not parse date/time from: "${textToParse}"`);
      }
    } catch (parseError) {
      console.error('Error parsing date/time:', parseError);
    }
  }

  // --- 7. Process Result (Book or Handle Failure) ---
  try {
    if (appointmentStart && customer) {
      // --- 7a. Book Appointment ---
      const startDate = appointmentStart.toISOString().split('T')[0]; // YYYY-MM-DD
      const startTime = appointmentStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); // HH:MM
      const endTime = addMinutesToTime(startTime, DEFAULT_APPOINTMENT_DURATION);
      const startDateTime = `${startDate} ${startTime}:00`; // Format for Easy!Appointments
      const endDateTime = `${startDate} ${endTime}:00`;

      console.log(`Attempting to book appointment: Service=${DEFAULT_APPOINTMENT_SERVICE_ID}, Customer=${customer.id}, Start=${startDateTime}, End=${endDateTime}`);

      if (!EASY_APPOINTMENTS_URL || !EASY_APPOINTMENTS_API_KEY) {
         throw new Error("Easy!Appointments URL or API Key not configured.");
      }

      const eaResponse = await axios.post(`${EASY_APPOINTMENTS_URL}/index.php/api/v1/appointments`, {
        start: startDateTime,
        end: endDateTime,
        notes: `Booked via Voice Agent. Original request: "${speechResult}"`,
        customerId: customer.id, // Ensure field names match Easy!Appointments API v1.x
        serviceId: DEFAULT_APPOINTMENT_SERVICE_ID,
        providerId: 1 // Assuming provider ID 1, adjust if needed
      }, {
        headers: {
          'Authorization': `Bearer ${EASY_APPOINTMENTS_API_KEY}`,
          'Content-Type': 'application/json'
         }
      });

      console.log('Easy!Appointments API Response:', eaResponse.data);
      const bookedAppointmentId = eaResponse.data.id; // Adjust based on actual response

      // --- 7b. Prepare Confirmation ---
      // Format date/time in a user-friendly way for the confirmation message
      const confirmationDate = appointmentStart.toLocaleDateString(detectedLanguage, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const confirmationTime = appointmentStart.toLocaleTimeString(detectedLanguage, { hour: 'numeric', minute: '2-digit', hour12: true });
      const confirmationText = `Okay, your appointment is booked for ${confirmationDate} at ${confirmationTime}.`; // Base confirmation in English
      const translatedConfirmation = await translateText(confirmationText, 'en', detectedLanguage);

      // --- 7c. Generate TTS Response ---
      const voiceResponse = await ultravoxTextToSpeech(translatedConfirmation, detectedLanguage);
      res.json({ voiceResponse }); // Send TTS response back to SignalWire/caller

      // --- 7d. Save Analytics (Asynchronously) ---
      if (firestore) {
        firestore.collection('call_analytics').add({
          subscriberEmail: customer.email,
          callId: callId || 'N/A',
          timestamp: admin.firestore.FieldValue.serverTimestamp(), // Use server timestamp
          duration: parseInt(duration || '0', 10), // Ensure duration is a number
          sentiment: sentiment,
          transcript: transcript,
          detectedLanguage: detectedLanguage,
          appointmentBooked: true,
          appointmentId: bookedAppointmentId,
          appointmentTime: appointmentStart // Store as Firestore Timestamp
        }).catch(err => console.error("Error saving analytics to Firestore:", err)); // Log error but don't block response
      }

    } else {
      // --- 7e. Handle Parsing Failure or Missing Info ---
      console.log('Appointment not booked (parsing failed or missing info).');
      const errorMessage = 'Sorry, I couldn’t understand the date or time you requested. Could you please try again?';
      const translatedError = await translateText(errorMessage, 'en', detectedLanguage);
      const voiceResponse = await ultravoxTextToSpeech(translatedError, detectedLanguage);
      res.json({ voiceResponse });

       // --- 7f. Save Analytics for Failed Attempt (Asynchronously) ---
       if (firestore && customer) {
         firestore.collection('call_analytics').add({
           subscriberEmail: customer.email,
           callId: callId || 'N/A',
           timestamp: admin.firestore.FieldValue.serverTimestamp(),
           duration: parseInt(duration || '0', 10),
           sentiment: sentiment,
           transcript: transcript,
           detectedLanguage: detectedLanguage,
           appointmentBooked: false,
           failureReason: 'Parsing failed'
         }).catch(err => console.error("Error saving analytics to Firestore:", err));
       }
    }
  } catch (error) {
    // --- 8. Handle General Errors ---
    console.error('Error processing /voice request:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    console.error(error.stack); // Log stack trace

    let genericErrorMessage = 'Sorry, an unexpected error occurred while processing your request.';
    // Try to translate the generic error message
    const translatedGenericError = await translateText(genericErrorMessage, 'en', detectedLanguage);
    const voiceResponse = await ultravoxTextToSpeech(translatedGenericError, detectedLanguage);
    res.status(500).json({ voiceResponse });

     // --- 8a. Save Analytics for General Error (Asynchronously) ---
     if (firestore && customer) {
       firestore.collection('call_analytics').add({
         subscriberEmail: customer.email,
         callId: callId || 'N/A',
         timestamp: admin.firestore.FieldValue.serverTimestamp(),
         duration: parseInt(duration || '0', 10),
         sentiment: sentiment,
         transcript: transcript,
         detectedLanguage: detectedLanguage,
         appointmentBooked: false,
         failureReason: `Server error: ${error.message}`
       }).catch(err => console.error("Error saving analytics to Firestore:", err));
     }
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('--- Configured Settings ---');
  console.log(`PORT: ${PORT}`);
  console.log(`GOOGLE_PROJECT_ID: ${GOOGLE_PROJECT_ID ? 'Set' : 'Not Set'}`);
  console.log(`DATABASE_URL: ${DATABASE_URL ? 'Set' : 'Not Set'}`);
  console.log(`REDIS_URL: ${REDIS_URL ? 'Set' : 'Not Set'}`);
  console.log(`EASY_APPOINTMENTS_URL: ${EASY_APPOINTMENTS_URL || 'Not Set'}`);
  console.log(`EASY_APPOINTMENTS_API_KEY: ${EASY_APPOINTMENTS_API_KEY ? 'Set' : 'Not Set'}`);
  console.log(`FIREBASE_SERVICE_ACCOUNT: ${FIREBASE_SERVICE_ACCOUNT ? 'Set' : 'Not Set'}`);
  console.log(`ULTRAVOX_TTS_URL: ${ULTRAVOX_TTS_URL || 'Not Set (Mock TTS will be used)'}`);
  console.log('---------------------------');
});
