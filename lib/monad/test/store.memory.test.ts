import { MemorySettlementStore } from "../store/memory";
import { storeContract } from "./store.contract";

storeContract("memory", async () => new MemorySettlementStore());
