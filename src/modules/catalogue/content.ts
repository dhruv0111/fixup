export const policyDrafts = {
  privacy: {
    title: "Privacy Policy",
    body: "Information collected\nEnquiry forms request contact and business details so FIXUP can respond. Account information is handled by the existing account service.\n\nUse and access\nAuthorised staff use submitted information to follow up. WhatsApp conversations take place outside this application and are not automatically stored here.\n\nOwner decisions pending\nConfirm the legal business identity, retention periods, service providers, privacy contact and rights request procedure before approval.",
  },
  terms: {
    title: "Terms and Conditions",
    body: "Website information\nThe catalogue provides product information and a way to request details. An enquiry is not an accepted order.\n\nProduct information\nConsult approved manufacturer documentation for suitability and safe handling. Product brands remain identified separately from FIXUP.\n\nOwner decisions pending\nConfirm the legal business name, applicable terms of sale, quotation validity, dispute process and jurisdiction before approval.",
  },
  shipping: {
    title: "Shipping Policy",
    body: "Delivery enquiries\nFIXUP plans to support local and courier delivery. Ask about the service available for your location and requested products.\n\nDetails to confirm\nDelivery area, courier restrictions, packing, charges, dispatch times and tracking arrangements must be confirmed before an order is accepted.\n\nOwner decisions pending\nPublish approved delivery commitments and the process for delayed or damaged shipments.",
  },
  returns: {
    title: "Return and Refund Policy",
    body: "Request assistance\nContact FIXUP with the product and issue details to discuss a return or refund enquiry.\n\nDetails to confirm\nEligibility, time limits, product condition, evidence requirements, return transport and refund processing are awaiting business approval.\n\nOwner decisions pending\nConfirm the applicable consumer obligations and final return procedure before approval.",
  },
} as const;

export function whatsappUrl(number: string, message: string) {
  return /^[1-9][0-9]{7,14}$/.test(number)
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : null;
}
export const generalMessage =
  "Hello FIXUP, I would like to enquire about your adhesive products.";
export const bulkMessage =
  "Hello FIXUP, I would like to discuss a bulk order. Product: __. Quantity: __. Delivery location: __.";
export function productMessage(product: {
  name: string;
  sku: string | null;
  packSize: string;
}) {
  return `Hello FIXUP, I would like to enquire about ${product.name} (${product.sku ? `SKU: ${product.sku}, ` : ""}pack: ${product.packSize}). Quantity: __. Location: __.`;
}
