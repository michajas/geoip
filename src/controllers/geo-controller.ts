import { Request, Response } from "express";
import { geoLookupService } from "../services/geo-lookup-service";

/**
 * Controller for handling geolocation requests
 */
export class GeoController {
  /**
   * Look up geolocation data for an IP address
   */
  public lookup = async (req: Request, res: Response): Promise<void> => {
    try {
      const ip = req.query.ip as string;

      if (!ip) {
        res.status(400).json({
          message: "IP address is required",
        });
        return;
      }

      console.log(`Received geolocation request for IP: ${ip}`);
      const result = await geoLookupService.lookup(ip);

      if (result) {
        res.json(result);
      } else {
        res.status(404).json({
          message: "No geolocation data found for the provided IP address",
          ip,
        });
      }
    } catch (error) {
      console.error("Error processing geo lookup:", error);
      res.status(500).json({
        message: "An error occurred while processing your request",
      });
    }
  };
}

// Export a singleton instance of the controller
export const geoController = new GeoController();
