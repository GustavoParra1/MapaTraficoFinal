const functions = require("firebase-functions/v1");
const axios = require("axios");

// API Key de Google Maps
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyDC8I8UrgCcHH0TWTOURa0b4Ro6EhVx29E";

/**
 * Cloud Function para geocodificar direcciones
 * Acepta una dirección y retorna coordenadas (lat, lng)
 */
exports.geocodeAddress = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }

  try {
    const address = req.query.address || req.body.address;

    if (!address) {
      return res.status(400).json({
        error: "Address parameter is required",
      });
    }

    console.log(`🔍 Geocoding address: ${address}`);

    const query = address.trim();

    // Detectar si es una búsqueda de cruce (formato: "calle y calle" o "calle & calle")
    const intersectionMatch = query.match(/^(.+?)\s+(?:y|&)\s+(.+?)$/i);

    if (intersectionMatch) {
      // Es un cruce - buscar como intersección o punto medio
      const street1 = intersectionMatch[1].trim();
      const street2 = intersectionMatch[2].trim();

      console.log(`🔍 Searching intersection: "${street1}" and "${street2}"`);

      // Primero intentar buscar la intersección como una sola búsqueda
      const intersectionQuery = `${street1} y ${street2}, Mar del Plata, Argentina`;
      const urlIntersection = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        intersectionQuery
      )}&key=${GOOGLE_MAPS_API_KEY}`;

      try {
        const resIntersection = await axios.get(urlIntersection);
        const dataIntersection = resIntersection.data;

        if (
          dataIntersection.results &&
          dataIntersection.results.length > 0
        ) {
          const location = dataIntersection.results[0].geometry.location;
          const formattedAddress =
            dataIntersection.results[0].formatted_address;
          console.log(
            `✅ Intersection found directly: ${formattedAddress}`
          );
          return res.json({
            lat: location.lat,
            lng: location.lng,
            formatted_address: formattedAddress,
          });
        }
      } catch (error) {
        console.log("⚠️ Intersection search failed, trying midpoint...");
      }

      // Si no encuentra, buscar cada calle por separado y calcular punto medio
      try {
        const url1 = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          street1 + ", Mar del Plata, Argentina"
        )}&key=${GOOGLE_MAPS_API_KEY}`;
        const res1 = await axios.get(url1);
        const data1 = res1.data;

        const url2 = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          street2 + ", Mar del Plata, Argentina"
        )}&key=${GOOGLE_MAPS_API_KEY}`;
        const res2 = await axios.get(url2);
        const data2 = res2.data;

        if (
          data1.results &&
          data1.results.length > 0 &&
          data2.results &&
          data2.results.length > 0
        ) {
          const loc1 = data1.results[0].geometry.location;
          const loc2 = data2.results[0].geometry.location;

          console.log(
            `✅ ${street1}: ${loc1.lat}, ${loc1.lng}`
          );
          console.log(
            `✅ ${street2}: ${loc2.lat}, ${loc2.lng}`
          );

          // Calcular punto medio (aproximación de intersección)
          const lat = (loc1.lat + loc2.lat) / 2;
          const lng = (loc1.lng + loc2.lng) / 2;

          console.log(`🎯 Midpoint: ${lat}, ${lng}`);
          return res.json({
            lat,
            lng,
            formatted_address: `${street1} y ${street2}, Mar del Plata, Argentina`,
          });
        } else {
          console.warn("⚠️ One or both streets not found");
          if (!data1.results || data1.results.length === 0) {
            console.log(`❌ ${street1} not found`);
          }
          if (!data2.results || data2.results.length === 0) {
            console.log(`❌ ${street2} not found`);
          }
          return res.status(404).json({
            error: "One or both streets not found",
          });
        }
      } catch (error) {
        console.error("Error searching streets:", error.message);
        return res.status(500).json({
          error: "Error searching streets",
          details: error.message,
        });
      }
    } else {
      // Es una dirección normal - buscar en Google Maps
      console.log(`🔍 Searching address: "${query}"`);

      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        query + ", Mar del Plata, Argentina"
      )}&key=${GOOGLE_MAPS_API_KEY}`;

      try {
        const response = await axios.get(url);
        const data = response.data;

        if (data.results && data.results.length > 0) {
          const location = data.results[0].geometry.location;
          const formattedAddress = data.results[0].formatted_address;

          console.log(`✅ Address found: ${formattedAddress}`);
          console.log(`📍 ${location.lat}, ${location.lng}`);

          return res.json({
            lat: location.lat,
            lng: location.lng,
            formatted_address: formattedAddress,
          });
        } else {
          console.warn("❌ Address not found");
          return res.status(404).json({
            error: "Address not found",
          });
        }
      } catch (error) {
        console.error("Error geocoding address:", error.message);
        return res.status(500).json({
          error: "Error geocoding address",
          details: error.message,
        });
      }
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({
      error: "Unexpected error",
      details: error.message,
    });
  }
});

// --- Informe de Seguridad por Barrio (IA con Gemini, capa gratuita) ---
exports.generarInformeIA = require('./generarInformeIA').generarInformeIA;

