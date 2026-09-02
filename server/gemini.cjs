function providerStatus(error) {
  return Number(error?.status || error?.code) || 0;
}

// Retry only the read-only model call, never the database write/entire POST.
async function generateWithRetry(ai, request, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  try {
    return await ai.models.generateContent(request);
  } catch (error) {
    if (![429, 502, 503, 504].includes(providerStatus(error))) throw error;
    await wait(250 + Math.floor(Math.random() * 150));
    return ai.models.generateContent(request);
  }
}

module.exports = { generateWithRetry, providerStatus };
