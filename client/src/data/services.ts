import type { Service } from "../types";

export const serviceCatalog: Service[] = [
  {
    id: "standard-home",
    name: "Standard Service Visit",
    duration: "2-3 hours",
    durationHours: 3,
    price: "From $120",
    description: "A focused service visit for routine customer requests and recurring appointments."
  },
  {
    id: "deep-clean",
    name: "Extended Service Visit",
    duration: "4-6 hours",
    durationHours: 6,
    price: "From $240",
    description: "A longer appointment for detailed work, larger jobs, or more involved requests."
  },
  {
    id: "move-out",
    name: "Project Service",
    duration: "5-7 hours",
    durationHours: 7,
    price: "From $320",
    description: "A project-sized service for one-off work that needs more time and preparation."
  },
  {
    id: "office-care",
    name: "Business Service",
    duration: "Custom",
    durationHours: 2,
    price: "Quote",
    description: "A configurable business service for commercial or recurring account requests."
  }
];

export function findService(serviceId: string | null): Service | undefined {
  return serviceCatalog.find((service) => service.id === serviceId);
}
