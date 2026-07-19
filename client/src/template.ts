export const templateConfig = {
  business: {
    name: "ServiceCo",
    category: "Local Services",
    shortName: "ServiceCo"
  },
  pages: {
    home: {
      eyebrow: "Built for local service booking queues",
      headline: "ServiceCo",
      subheadline:
        "A clean booking flow for local service teams, with every request landing in one owner-facing queue.",
      primaryCta: "Book a service",
      secondaryCta: "View services",
      stats: [
        { value: "24h", label: "Owner visibility" },
        { value: "Secure", label: "Customer manage links" }
      ],
      workflowEyebrow: "Daily workflow",
      workflowHeading: "From service choice to owner queue"
    },
    services: {
      eyebrow: "Service menu",
      heading: "Choose the service queue that fits the job.",
      intro: "Each service can be selected directly from this page and carried into the booking form."
    },
    booking: {
      eyebrow: "Booking page",
      heading: "Request an appointment.",
      intro: "Customer details go straight into the admin queue with the selected service attached."
    }
  }
};
