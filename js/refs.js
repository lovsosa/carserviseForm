export const REF = {
  DC: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 141, TITLE_FIELD: "NAME", TARGET_FIELD: "PROPERTY_715" },
  PDC: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 139, TITLE_FIELD: "NAME", PARENT_FIELD: "PROPERTY_651" },

  EXPENSE_ARTICLE: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 133, TITLE_FIELD: "NAME" },
  EXPENSE_SUBARTICLE: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 135, TITLE_FIELD: "NAME", PARENT_FIELD: "PROPERTY_647" },

  PAYMENT_TYPE: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 143, TITLE_FIELD: "NAME" },
  PAYMENT_TIMING: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 145, TITLE_FIELD: "NAME" },
};

export const bizopsList = {
  initiatorId: "INITSIATOR_SZ",
  dealerCenterId: "DILLERSKIY_TSENTR",
  expenseDepartmentId: "for_whom",
  expenseCategoryId: "STATYA",
  expenseSubcategoryId: "PODSTATYA",
  title: "NAME",
  amount: "SUMMA",
  currency: "SUMMA",
  paymentType: "OPLATY_TIP",
  paymentTiming: "OPLATY_FORMA",
  contractor: "NAIMENOVANIE_KONTRAGENTA",
  contractNo: "_DOGOVORA",
  invoiceNo: "_SCHETA",
  needText: "OPISANIE_NEOBKHODIMOSTI_RASKHODA_V_SVOBODNOY_FORME",
  files: "FAYLOVYE_VLOZHENIYA",
};

export const SETTINGS = {
  ENABLE_SELECT_SEARCH: true,
  HINTS_ENABLED: false,
  DEBUG_DUMP_VALUES: false,
};
