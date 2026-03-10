import { MongoClient } from "mongodb";

/**
 * Cluster Manager for MongoDB connections
 * Manages multiple MongoDB clusters for metadata and content storage
 */

// Content clusters from environment variables
const CONTENT_CLUSTERS = [
  {
    name: "c0",
    uri: process.env.C0_MONGODB_URI
  },
  {
    name: "c1",
    uri: process.env.C1_MONGODB_URI
  },
];

class ClusterManager {
  private clients: Map<string, MongoClient> = new Map();

  async getClient(clusterName: string): Promise<MongoClient> {
    // If we already have this client, return it

    if (this.clients.has(clusterName)) {
      return this.clients.get(clusterName)!;
    }
    let cluster;
    if (clusterName == "META_MONGO_URI") {
      const metaUri = process.env.META_MONGO_URI;
      if (!metaUri) {
        throw new Error(
          'META_MONGO_URI environment variable is not set. Please configure your database connection in environment variables.'
        );
      }
      cluster = { name: "META_MONGO_URI", uri: metaUri };
    }
    else {
      cluster = CONTENT_CLUSTERS.find(c => c.name === clusterName);
    }
    if (!cluster) {
      throw new Error(`Cluster ${clusterName} not found`);
    }
    // Check if URI is valid
    if (!cluster.uri || cluster.uri === "none" || !cluster.uri.includes("mongodb")) {
      throw new Error(`Cluster ${clusterName} has invalid or missing URI. Please check your environment variables.`);
    }

    try {
      // Create new client with configurable limits
      // Pool sizes can be configured via environment variables for different environments
      const maxPoolSize = parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10);
      const minPoolSize = parseInt(process.env.MONGO_MIN_POOL_SIZE || '2', 10);
      const connectTimeoutMS = parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || '30000', 10);

      const client = new MongoClient(cluster.uri, {
        maxPoolSize,
        minPoolSize,
        connectTimeoutMS,
      });
      await client.connect();

      // Store it for reuse
      this.clients.set(clusterName, client);

      return client;
    } catch (error) {
      console.error(`❌ Failed to connect to cluster ${clusterName}:`, error);

      // Only content clusters (c0, c1, etc.) should fall back to metadata cluster
      // Never fall back if we're already trying to connect to the metadata cluster
      if (clusterName !== "cluster0" && clusterName !== "META_MONGO_URI") {
        console.error(`Falling back to metadata cluster for ${clusterName}`);
        return this.getMetadataClient();
      }

      throw error;
    }
  }

  // Always get cluster0 for metadata
  async getMetadataClient(): Promise<MongoClient> {
    return this.getClient("META_MONGO_URI");
  }

  // Get any content cluster
  async getContentClient(clusterName: string): Promise<MongoClient> {
    if (clusterName === "cluster0") {
      // Allow cluster0 to be used for content as fallback
      return this.getMetadataClient();
    }
    return this.getClient(clusterName);
  }

  // Select a content cluster for new notes (round-robin or hash-based)
  selectContentCluster(noteId: string): string {
    const contentClusters = CONTENT_CLUSTERS.filter(c => c.name !== "cluster0");

    // If no content clusters available, fall back to cluster0
    if (contentClusters.length === 0) {
      return "cluster0";
    }

    // Simple hash-based selection for consistent distribution
    let hash = 0;
    for (let i = 0; i < noteId.length; i++) {
      const char = noteId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    const clusterIndex = Math.abs(hash) % contentClusters.length;
    const selectedCluster = contentClusters[clusterIndex];
    if (!selectedCluster) {
      return "cluster0";
    }

    if (!selectedCluster.name) {
      return "cluster0";
    }
    return selectedCluster.name;
  }

  // Generate a unique content ID
  generateContentId(): string {
    return new Date().getTime().toString() + Math.random().toString(36).substr(2, 9);
  }
}

// Export singleton instance
export const clusterManager = new ClusterManager();
export default clusterManager;
