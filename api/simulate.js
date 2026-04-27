export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { date_naissance, date_permis, date_mec, numero_formule } = req.body;

  if (!date_naissance || !date_permis || !date_mec || !numero_formule) {
    return res.status(400).json({
      error: "Champs requis manquants : date_naissance, date_permis, date_mec, numero_formule",
    });
  }

  const FORMULE_MAP = { F1: "Tiers", F2: "Tiers+", F3: "Tiers+ Confort", F4: "Tous risques" };
  if (!FORMULE_MAP[numero_formule]) {
    return res.status(400).json({ error: "numero_formule invalide. Valeurs acceptées : F1, F2, F3, F4" });
  }

  const today = new Date().toISOString().slice(0, 10);

  const coherentBody = {
    request_data: {
      inputs: {
        anciennete_crm50_cp: 5,
        anciennete_crm50_cs: 0,
        assistance: "Tarif Forfaitaire MONDIAL - 30 KM",
        boite_vitesse: "M",
        canal: "ALEOC999999",
        carrosserie: "BERLINE",
        classe_sra: "F",
        conduite_accompagnee: "Non",
        contenu_equipement: "Non",
        CRM_cp: 0.5,
        crm_cs: 1,
        csp: "Salarié",
        date_acquisition: date_mec,
        date_effet: today,
        date_mec: date_mec,
        date_naissance_cp: date_naissance,
        date_naissance_cs: date_naissance,   // miroir CP pour éviter exclusions CS
        date_permis_cp: date_permis,
        date_permis_cs: date_permis,         // miroir CP pour éviter exclusions CS
        departement: 75,
        energie: "ES",
        forfait_km: "Non",
        fractionnement: "MENSUEL",
        franchise_bdg: "Rachat total",
        franchise_vidta: "Rachat total",
        garantie_gpc: "500 K€ - AIPP 15%",
        groupe_sra: 28,
        impayes: "Non",
        indemn_renforcee: "Non",
        marque: "RENAULT",
        mode_acquisition: "Comptant/Crédit",
        nb_cond: 1,
        nb_mois_assu_cp: 60,
        nb_mois_assu_cs: 60,
        numero_formule: numero_formule,
        sin_bdg: 0,
        sin_corp_nr: 0,
        sin_corp_resp: 0,
        sin_inc: 0,
        sin_mat_nr: 0,
        sin_mat_resp: 0,
        sin_vol: 0,
        type_parking: "Sans garage",
        usage: "Déplacements privés, trajet travail",
        zone_bdg: 2,
        zone_rcvidom: 11,
      },
    },
    request_meta: {
      version_id: "3bdeb9de-ba23-4458-bccc-4e9eb7efff73",
      transaction_date: null,
      call_purpose: "Leocare GPT simulation",
      source_system: "vercel-proxy",
      correlation_id: `gpt-${Date.now()}`,
      requested_output: null,
      service_category: "All",
      excel_file_writer: null,
      xreport_options: null,
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
      return res.status(502).json({ error: `Erreur API Coherent : ${response.status}`, detail: errText });
    }

    const data = await response.json();
    const outputs = data?.response_data?.outputs ?? {};

    const etat = outputs.etat_du_profil ?? "";
    if (!etat.includes("OK")) {
      return res.status(200).json({ eligible: false, message: `Profil non éligible : ${etat}` });
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
    return res.status(500).json({ error: "Erreur interne du proxy", detail: err.message });
  }
}
