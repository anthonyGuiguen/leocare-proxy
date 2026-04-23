export default async function handler(req, res) {
  // CORS — autorise les appels depuis ChatGPT
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { birthdate, drivingLicenceAcquisitionDate, registrationDate } =
    req.body;

  if (!birthdate || !drivingLicenceAcquisitionDate || !registrationDate) {
    return res.status(400).json({
      error:
        "Champs requis manquants : birthdate, drivingLicenceAcquisitionDate, registrationDate",
    });
  }

  // Body complet avec valeurs par défaut + 3 valeurs dynamiques
  const leocareBody = {
    declaration: {
      vehicle: {
        id: "DC03157",
        make: { id: "DC", label: "DACIA" },
        model: { id: "03", label: "DUSTER", makeId: "DC" },
        version: {
          id: "157",
          label: "1.5 BLUE DCI 95 (PA : 5 cv)",
          modelId: "03",
        },
        sraClass: "E",
        sraGroup: "29",
        registrationDate: registrationDate,
      },
      parkingAddress: { town: "Lannion", zipCode: "22300" },
      parkingType: { type: "GARAGE" },
      insuranceHistory: {
        convictedResistingArrestOrNoInsurance: false,
        convictedAlcoholOrDrug: false,
        licenseCanceledOrSuspended: false,
        contractCanceled: false,
      },
      birthdate: birthdate,
      drivingLicenceAcquisitionDate: drivingLicenceAcquisitionDate,
      carUsage: "PRIVATE",
      driverCsp: "FONCTIONNAIRE_A",
      isDriverSedentary: true,
      isLoa: false,
      noclaimsBonus: 0.9,
      numberOfMaterialAccidents: 0,
      numberOfPersonalAccidents: 0,
      numberOfBrokenGlassAccidents: 0,
      numberOfFireAccidents: 0,
      numberOfThefts: 0,
      numberOfNotResponsibleMaterialAccidents: 0,
      numberOfNotResponsiblePersonalAccidents: 0,
      numberOfOtherClaims: 0,
      insuranceSeniorityInMonth: { type: "EQUAL", value: 36 },
    },
    productType: "CONTRACT_TYPE_CAR_ESTIMATE",
    state: "ESTIMATION_REQUESTED",
    businessPartner: { businessPartnerName: "ALEOC003" },
    anonymousUserkey: "69e8ebcc109a35a4834d6538",
  };

  try {
    const response = await fetch(
      "https://api-frontoffice.leocare.eu/api/v5/simulations/price",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leocareBody),
      }
    );

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: `Erreur API Leocare : ${response.status}` });
    }

    const data = await response.json();

    // Extraire uniquement les prix par formule
    const options = data?.estimation?.options ?? [];
    const formules = ["Tiers", "Tiers+", "Tous risques"];

    const prices = {};
    for (const formule of formules) {
      const option = options.find((o) => o.name === formule);
      if (option) {
        prices[formule] = {
          monthly: Math.round(option.monthly.price * 100) / 100,
          yearly: Math.round(option.yearly.price * 100) / 100,
        };
      }
    }

    return res.status(200).json({ prices });
  } catch (err) {
    return res.status(500).json({ error: "Erreur interne du proxy", detail: err.message, cause: err.cause?.message ?? null });
  }
}
