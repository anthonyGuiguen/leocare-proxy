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

  const { date_naissance, date_permis, date_mec, numero_formule } = req.body;

  if (!date_naissance || !date_permis || !date_mec || !numero_formule) {
    return res.status(400).json({
      error: "Champs requis manquants : date_naissance, date_permis, date_mec, numero_formule",
    });
  }

  const FORMULE_MAP = {
    F1: "Tiers",
    F2: "Tiers+",
    F3: "Tiers+ Confort",
    F4: "Tous risques",
  };

  if (!FORMULE_MAP[numero_formule]) {
    return res.status(400).json({
      error: "numero_formule invalide. Valeurs acceptées : F1, F2, F3, F4",
    });
  }

  const coherentBody = {
    request_data: {
      inputs: {
        date_naissance_cp: date_naissance,
        date_permis_cp: date_permis,
        date_mec: date_mec,
        numero_formule: numero_formule,
        fractionnement: "ANNUEL",
        crmbonus: 0.5,
        cp_conducteur: "75001",
        marque: "RENAULT",
        modele: "CLIO",
        puissance_fiscale: 5,
        energie: "ESSENCE",
        usage_vehicule: "VP",
        valeur_vehicule: 10000,
        km_annuel: 10000,
        stationnement: "GARAGE",
        conduite_exclusive: false,
        jeune_conducteur: false,
        bonus_malus: 1,
        sinistres_3ans: 0,
        suspension_permis: false,
        annulation_assurance: false,
        conducteur_secondaire: false,
      },
    },
    request_meta: {
      version_id: "draft",
      call_purpose: "Leocare GPT simulation",
      source_system: "vercel-proxy",
      correlation_id: `gpt-${Date.now()}`,
    },
  };

  const SYNTHETIC_KEY = process.env.COHERENT_SYNTHETIC_KEY;

  try {
    const response = await fetch(
      "https://excel.uat.eu.coherent.global/leocare/api/v3/folders/Tarification%20CMAM/services/Calculette%20CMAM%20V2%20-%20version%20Coherent/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-synthetic-key": SYNTHETIC_KEY,
          "x-tenant-name": "leocare",
        },
        body: JSON.stringify(coherentBody),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({
        error: `Erreur API Coherent : ${response.status}`,
        detail: errText,
      });
    }

    const data = await response.json();
    const outputs = data?.response_data?.outputs ?? {};

    const etat = outputs.etat_du_profil ?? "";
    if (!etat.includes("OK")) {
      return res.status(200).json({
        eligible: false,
        message: `Profil non éligible : ${etat}`,
      });
    }

    const prixAnnuel = outputs.TTC_final_si_etat_OK ?? outputs.TTC_final ?? null;
    const prixMensuel = prixAnnuel !== null ? Math.round((prixAnnuel / 12) * 100) / 100 : null;

    return res.status(200).json({
      eligible: true,
      formule: FORMULE_MAP[numero_formule],
      prix_mensuel: prixMensuel,
      prix_annuel: prixAnnuel !== null ? Math.round(prixAnnuel * 100) / 100 : null,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Erreur interne du proxy",
      detail: err.message,
      cause: err.cause?.message ?? null,
    });
  }
}
