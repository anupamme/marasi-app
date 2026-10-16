export namespace chrome {
	
	export class PathConfig {
	    OS: string;
	    Path: string;
	
	    static createFrom(source: any = {}) {
	        return new PathConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.OS = source["OS"];
	        this.Path = source["Path"];
	    }
	}

}

export namespace domain {
	
	export class ArmoryRun {
	    ID: number[];
	    TemplateID: number[];
	    TemplateSnapshot: string;
	    UseHTTPS: boolean;
	    Wordlists: string[];
	    Status: string;
	    AttackType: string;
	    MaxConcurrent: number;
	    // Go type: time
	    CreatedAt: any;
	    // Go type: time
	    StartedAt?: any;
	    // Go type: time
	    FinishedAt?: any;
	
	    static createFrom(source: any = {}) {
	        return new ArmoryRun(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.TemplateID = source["TemplateID"];
	        this.TemplateSnapshot = source["TemplateSnapshot"];
	        this.UseHTTPS = source["UseHTTPS"];
	        this.Wordlists = source["Wordlists"];
	        this.Status = source["Status"];
	        this.AttackType = source["AttackType"];
	        this.MaxConcurrent = source["MaxConcurrent"];
	        this.CreatedAt = this.convertValues(source["CreatedAt"], null);
	        this.StartedAt = this.convertValues(source["StartedAt"], null);
	        this.FinishedAt = this.convertValues(source["FinishedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ArmoryTemplate {
	    ID: number[];
	    Name: string;
	    Description: string;
	    RawTemplate: string;
	
	    static createFrom(source: any = {}) {
	        return new ArmoryTemplate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.Description = source["Description"];
	        this.RawTemplate = source["RawTemplate"];
	    }
	}
	export class Artifact {
	    ID: number[];
	    Filename: string;
	    MimeType: string;
	    Size: number;
	    // Go type: time
	    CreatedAt: any;
	    TestCaseID?: number[];
	    FindingID?: number[];
	    Data: number[];
	
	    static createFrom(source: any = {}) {
	        return new Artifact(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Filename = source["Filename"];
	        this.MimeType = source["MimeType"];
	        this.Size = source["Size"];
	        this.CreatedAt = this.convertValues(source["CreatedAt"], null);
	        this.TestCaseID = source["TestCaseID"];
	        this.FindingID = source["FindingID"];
	        this.Data = source["Data"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ArtifactMetadata {
	    ID: number[];
	    Filename: string;
	    MimeType: string;
	    Size: number;
	    // Go type: time
	    CreatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ArtifactMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Filename = source["Filename"];
	        this.MimeType = source["MimeType"];
	        this.Size = source["Size"];
	        this.CreatedAt = this.convertValues(source["CreatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CheckpointItem {
	    ID: number[];
	    Type: string;
	    Raw: number[];
	    Payload: number[];
	    Opcode: number;
	    Direction: string;
	    ConnectionID: number[];
	    RequestID: number[];
	
	    static createFrom(source: any = {}) {
	        return new CheckpointItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Type = source["Type"];
	        this.Raw = source["Raw"];
	        this.Payload = source["Payload"];
	        this.Opcode = source["Opcode"];
	        this.Direction = source["Direction"];
	        this.ConnectionID = source["ConnectionID"];
	        this.RequestID = source["RequestID"];
	    }
	}
	export class ClientSetting {
	    client: string;
	    key: string;
	    value: number[];
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new ClientSetting(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.client = source["client"];
	        this.key = source["key"];
	        this.value = source["value"];
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ContentTypeCount {
	    ContentType: string;
	    Count: number;
	
	    static createFrom(source: any = {}) {
	        return new ContentTypeCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ContentType = source["ContentType"];
	        this.Count = source["Count"];
	    }
	}
	export class ContentTypeCounts {
	    Counts: ContentTypeCount[];
	    Complete: Record<string, boolean>;
	
	    static createFrom(source: any = {}) {
	        return new ContentTypeCounts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Counts = this.convertValues(source["Counts"], ContentTypeCount);
	        this.Complete = source["Complete"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Extension {
	    ID: number[];
	    Name: string;
	    SourceURL: string;
	    Author: string;
	    LuaContent: string;
	    Enabled: boolean;
	    Description: string;
	    Settings: Record<string, any>;
	    // Go type: time
	    UpdatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Extension(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.SourceURL = source["SourceURL"];
	        this.Author = source["Author"];
	        this.LuaContent = source["LuaContent"];
	        this.Enabled = source["Enabled"];
	        this.Description = source["Description"];
	        this.Settings = source["Settings"];
	        this.UpdatedAt = this.convertValues(source["UpdatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Finding {
	    ID: number[];
	    TestCaseID?: number[];
	    Title: string;
	    Requests: number[][];
	    CVSSVector: string;
	    CVSSScore: number;
	    Severity: string;
	    WriteUp: string;
	    TreatmentPlan: string;
	    Artifacts: ArtifactMetadata[];
	    // Go type: time
	    CreatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Finding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.TestCaseID = source["TestCaseID"];
	        this.Title = source["Title"];
	        this.Requests = source["Requests"];
	        this.CVSSVector = source["CVSSVector"];
	        this.CVSSScore = source["CVSSScore"];
	        this.Severity = source["Severity"];
	        this.WriteUp = source["WriteUp"];
	        this.TreatmentPlan = source["TreatmentPlan"];
	        this.Artifacts = this.convertValues(source["Artifacts"], ArtifactMetadata);
	        this.CreatedAt = this.convertValues(source["CreatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Launch {
	    ID: number[];
	    LaunchpadID: number[];
	    Status: string;
	    Reason: string;
	
	    static createFrom(source: any = {}) {
	        return new Launch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.LaunchpadID = source["LaunchpadID"];
	        this.Status = source["Status"];
	        this.Reason = source["Reason"];
	    }
	}
	export class Launchpad {
	    ID: number[];
	    Name: string;
	    Description: string;
	    EntryCount: number;
	    LastStatusCode?: number;
	
	    static createFrom(source: any = {}) {
	        return new Launchpad(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.Description = source["Description"];
	        this.EntryCount = source["EntryCount"];
	        this.LastStatusCode = source["LastStatusCode"];
	    }
	}
	export class Log {
	    ID: number[];
	    // Go type: time
	    Timestamp: any;
	    Level: string;
	    Message: string;
	    Context: Record<string, any>;
	    RequestID?: number[];
	    ExtensionID?: number[];
	
	    static createFrom(source: any = {}) {
	        return new Log(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Timestamp = this.convertValues(source["Timestamp"], null);
	        this.Level = source["Level"];
	        this.Message = source["Message"];
	        this.Context = source["Context"];
	        this.RequestID = source["RequestID"];
	        this.ExtensionID = source["ExtensionID"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Prettified {
	    Request: string;
	    Response: string;
	
	    static createFrom(source: any = {}) {
	        return new Prettified(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Request = source["Request"];
	        this.Response = source["Response"];
	    }
	}
	export class ProxyRequest {
	    ID: number[];
	    Scheme: string;
	    Method: string;
	    Host: string;
	    Path: string;
	    Raw: number[];
	    Metadata: Record<string, any>;
	    Prettified: string;
	    // Go type: time
	    RequestedAt: any;
	    SitemapNode: string;
	
	    static createFrom(source: any = {}) {
	        return new ProxyRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Scheme = source["Scheme"];
	        this.Method = source["Method"];
	        this.Host = source["Host"];
	        this.Path = source["Path"];
	        this.Raw = source["Raw"];
	        this.Metadata = source["Metadata"];
	        this.Prettified = source["Prettified"];
	        this.RequestedAt = this.convertValues(source["RequestedAt"], null);
	        this.SitemapNode = source["SitemapNode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProxyResponse {
	    ID: number[];
	    Status: string;
	    StatusCode: number;
	    ContentType: string;
	    Length: string;
	    Raw: number[];
	    Metadata: Record<string, any>;
	    Prettified: string;
	    // Go type: time
	    RespondedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ProxyResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Status = source["Status"];
	        this.StatusCode = source["StatusCode"];
	        this.ContentType = source["ContentType"];
	        this.Length = source["Length"];
	        this.Raw = source["Raw"];
	        this.Metadata = source["Metadata"];
	        this.Prettified = source["Prettified"];
	        this.RespondedAt = this.convertValues(source["RespondedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReportMetadata {
	    title: string;
	    client: string;
	    type: string;
	    is_draft: boolean;
	    scope: string;
	    assessor: string;
	    // Go type: time
	    start: any;
	    // Go type: time
	    end: any;
	    // Go type: time
	    created_at: any;
	    truncate_length: number;
	    custom_properties: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new ReportMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.client = source["client"];
	        this.type = source["type"];
	        this.is_draft = source["is_draft"];
	        this.scope = source["scope"];
	        this.assessor = source["assessor"];
	        this.start = this.convertValues(source["start"], null);
	        this.end = this.convertValues(source["end"], null);
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.truncate_length = source["truncate_length"];
	        this.custom_properties = source["custom_properties"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RequestResponseRow {
	    Request: ProxyRequest;
	    Response: ProxyResponse;
	    Metadata: Record<string, any>;
	    Note: string;
	    Highlight?: number;
	    Prettified: Prettified;
	
	    static createFrom(source: any = {}) {
	        return new RequestResponseRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Request = this.convertValues(source["Request"], ProxyRequest);
	        this.Response = this.convertValues(source["Response"], ProxyResponse);
	        this.Metadata = source["Metadata"];
	        this.Note = source["Note"];
	        this.Highlight = source["Highlight"];
	        this.Prettified = this.convertValues(source["Prettified"], Prettified);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RequestResponseSummary {
	    ID: number[];
	    Scheme: string;
	    Method: string;
	    Host: string;
	    Path: string;
	    Status: string;
	    StatusCode: number;
	    ContentType: string;
	    Length: string;
	    Metadata: Record<string, any>;
	    // Go type: time
	    RequestedAt: any;
	    // Go type: time
	    RespondedAt: any;
	    Note: string;
	    Highlight?: number;
	
	    static createFrom(source: any = {}) {
	        return new RequestResponseSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Scheme = source["Scheme"];
	        this.Method = source["Method"];
	        this.Host = source["Host"];
	        this.Path = source["Path"];
	        this.Status = source["Status"];
	        this.StatusCode = source["StatusCode"];
	        this.ContentType = source["ContentType"];
	        this.Length = source["Length"];
	        this.Metadata = source["Metadata"];
	        this.RequestedAt = this.convertValues(source["RequestedAt"], null);
	        this.RespondedAt = this.convertValues(source["RespondedAt"], null);
	        this.Note = source["Note"];
	        this.Highlight = source["Highlight"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SelectionQuery {
	    Text: string;
	    Exclusion: string[];
	    AsOf: number[];
	
	    static createFrom(source: any = {}) {
	        return new SelectionQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Text = source["Text"];
	        this.Exclusion = source["Exclusion"];
	        this.AsOf = source["AsOf"];
	    }
	}
	export class Selection {
	    IDs: number[][];
	    Query?: SelectionQuery;
	
	    static createFrom(source: any = {}) {
	        return new Selection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.IDs = source["IDs"];
	        this.Query = this.convertValues(source["Query"], SelectionQuery);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TestCase {
	    ID: number[];
	    Title: string;
	    Description: string;
	    Category: string;
	    Tags: string[];
	    Requests: number[][];
	    Artifacts: ArtifactMetadata[];
	    Note: string;
	    // Go type: time
	    CreatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new TestCase(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Title = source["Title"];
	        this.Description = source["Description"];
	        this.Category = source["Category"];
	        this.Tags = source["Tags"];
	        this.Requests = source["Requests"];
	        this.Artifacts = this.convertValues(source["Artifacts"], ArtifactMetadata);
	        this.Note = source["Note"];
	        this.CreatedAt = this.convertValues(source["CreatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WebSocketDeflate {
	    ServerNoContextTakeover: boolean;
	    ClientNoContextTakeover: boolean;
	    ServerMaxWindowBits: number;
	    ClientMaxWindowBits: number;
	
	    static createFrom(source: any = {}) {
	        return new WebSocketDeflate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ServerNoContextTakeover = source["ServerNoContextTakeover"];
	        this.ClientNoContextTakeover = source["ClientNoContextTakeover"];
	        this.ServerMaxWindowBits = source["ServerMaxWindowBits"];
	        this.ClientMaxWindowBits = source["ClientMaxWindowBits"];
	    }
	}
	export class WebSocketConnection {
	    ID: number[];
	    RequestID: number[];
	    State: string;
	    Transport: string;
	    Host: string;
	    Path: string;
	    // Go type: time
	    StartedAt: any;
	    // Go type: time
	    ClosedAt?: any;
	    CloseCode: number;
	    CloseReason: string;
	    Deflate?: WebSocketDeflate;
	    RemovedExtensions: string[];
	
	    static createFrom(source: any = {}) {
	        return new WebSocketConnection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.RequestID = source["RequestID"];
	        this.State = source["State"];
	        this.Transport = source["Transport"];
	        this.Host = source["Host"];
	        this.Path = source["Path"];
	        this.StartedAt = this.convertValues(source["StartedAt"], null);
	        this.ClosedAt = this.convertValues(source["ClosedAt"], null);
	        this.CloseCode = source["CloseCode"];
	        this.CloseReason = source["CloseReason"];
	        this.Deflate = this.convertValues(source["Deflate"], WebSocketDeflate);
	        this.RemovedExtensions = source["RemovedExtensions"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class WebSocketMessage {
	    ID: number[];
	    ConnectionID: number[];
	    RequestID: number[];
	    Direction: string;
	    Opcode: number;
	    FrameCount: number;
	    Compressed: boolean;
	    Payload: number[];
	    IsBinary: boolean;
	    // Go type: time
	    CreatedAt: any;
	    Metadata: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new WebSocketMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.ConnectionID = source["ConnectionID"];
	        this.RequestID = source["RequestID"];
	        this.Direction = source["Direction"];
	        this.Opcode = source["Opcode"];
	        this.FrameCount = source["FrameCount"];
	        this.Compressed = source["Compressed"];
	        this.Payload = source["Payload"];
	        this.IsBinary = source["IsBinary"];
	        this.CreatedAt = this.convertValues(source["CreatedAt"], null);
	        this.Metadata = source["Metadata"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace extensions {
	
	export class ExtensionLog {
	    // Go type: time
	    Time: any;
	    Text: string;
	
	    static createFrom(source: any = {}) {
	        return new ExtensionLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Time = this.convertValues(source["Time"], null);
	        this.Text = source["Text"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class SavedQuery {
	    id: string;
	    name: string;
	    query: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new SavedQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.query = source["query"];
	        this.order = source["order"];
	    }
	}
	export class AppSavedQueries {
	    queries: SavedQuery[];
	    hidden_builtins: string[];
	
	    static createFrom(source: any = {}) {
	        return new AppSavedQueries(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.queries = this.convertValues(source["queries"], SavedQuery);
	        this.hidden_builtins = source["hidden_builtins"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BuildInfo {
	    Channel: string;
	    Version: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Channel = source["Channel"];
	        this.Version = source["Version"];
	    }
	}
	export class TestCase {
	    Title: string;
	    Description: string;
	    Category: string;
	
	    static createFrom(source: any = {}) {
	        return new TestCase(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Title = source["Title"];
	        this.Description = source["Description"];
	        this.Category = source["Category"];
	    }
	}
	export class TestCaseProfile {
	    Title: string;
	    Description: string;
	    Version: string;
	    TestCases: TestCase[];
	
	    static createFrom(source: any = {}) {
	        return new TestCaseProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Title = source["Title"];
	        this.Description = source["Description"];
	        this.Version = source["Version"];
	        this.TestCases = this.convertValues(source["TestCases"], TestCase);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Config {
	    ConfigDir: string;
	    DesktopOS: string;
	    FirstRun: boolean;
	    VimEnabled: boolean;
	    DefaultAddress: string;
	    DefaultPort: string;
	    SyntaxMode: string;
	    TestCaseProfile: TestCaseProfile;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ConfigDir = source["ConfigDir"];
	        this.DesktopOS = source["DesktopOS"];
	        this.FirstRun = source["FirstRun"];
	        this.VimEnabled = source["VimEnabled"];
	        this.DefaultAddress = source["DefaultAddress"];
	        this.DefaultPort = source["DefaultPort"];
	        this.SyntaxMode = source["SyntaxMode"];
	        this.TestCaseProfile = this.convertValues(source["TestCaseProfile"], TestCaseProfile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Dashboard {
	    Requests: number;
	    Notes: number;
	    Launchpads: number;
	    Interceptions: number;
	
	    static createFrom(source: any = {}) {
	        return new Dashboard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Requests = source["Requests"];
	        this.Notes = source["Notes"];
	        this.Launchpads = source["Launchpads"];
	        this.Interceptions = source["Interceptions"];
	    }
	}
	export class ExtensionUI {
	    UICode: string;
	    Version: string;
	
	    static createFrom(source: any = {}) {
	        return new ExtensionUI(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.UICode = source["UICode"];
	        this.Version = source["Version"];
	    }
	}
	export class Highlight {
	    color: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new Highlight(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.color = source["color"];
	        this.label = source["label"];
	    }
	}
	export class HighlightMigration {
	    Ran: boolean;
	    Highlighted: number;
	    Cleared: number;
	
	    static createFrom(source: any = {}) {
	        return new HighlightMigration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Ran = source["Ran"];
	        this.Highlighted = source["Highlighted"];
	        this.Cleared = source["Cleared"];
	    }
	}
	export class JobState {
	    Name: string;
	    Complete: boolean;
	    Done: number;
	    Total: number;
	    Rebuildable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new JobState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Complete = source["Complete"];
	        this.Done = source["Done"];
	        this.Total = source["Total"];
	        this.Rebuildable = source["Rebuildable"];
	    }
	}
	export class KeybindingAction {
	    id: string;
	    context: string;
	    defaults: Record<string, string[]>;
	    positionalDefault: boolean;
	
	    static createFrom(source: any = {}) {
	        return new KeybindingAction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.context = source["context"];
	        this.defaults = source["defaults"];
	        this.positionalDefault = source["positionalDefault"];
	    }
	}
	export class KeybindingContext {
	    id: string;
	    overlaps: string[];
	
	    static createFrom(source: any = {}) {
	        return new KeybindingContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.overlaps = source["overlaps"];
	    }
	}
	export class KeybindingCatalog {
	    actions: KeybindingAction[];
	    contexts: KeybindingContext[];
	
	    static createFrom(source: any = {}) {
	        return new KeybindingCatalog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.actions = this.convertValues(source["actions"], KeybindingAction);
	        this.contexts = this.convertValues(source["contexts"], KeybindingContext);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class KeybindingProfile {
	    id: string;
	    name: string;
	    overrides: Record<string, KeybindingOverride[]>;
	    knownActions: string[];
	
	    static createFrom(source: any = {}) {
	        return new KeybindingProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.overrides = this.convertValues(source["overrides"], KeybindingOverride[], true);
	        this.knownActions = source["knownActions"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class KeybindingConfig {
	    version: number;
	    activeProfile: string;
	    profiles: KeybindingProfile[];
	
	    static createFrom(source: any = {}) {
	        return new KeybindingConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.activeProfile = source["activeProfile"];
	        this.profiles = this.convertValues(source["profiles"], KeybindingProfile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class KeybindingOverride {
	    action: string;
	    keys: string[];
	
	    static createFrom(source: any = {}) {
	        return new KeybindingOverride(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.keys = source["keys"];
	    }
	}
	
	export class KeybindingProfileFile {
	    path: string;
	    contents: string;
	
	    static createFrom(source: any = {}) {
	        return new KeybindingProfileFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.contents = source["contents"];
	    }
	}
	export class KeybindingState {
	    config: KeybindingConfig;
	    problem: string;
	
	    static createFrom(source: any = {}) {
	        return new KeybindingState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.config = this.convertValues(source["config"], KeybindingConfig);
	        this.problem = source["problem"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TrafficQueryError {
	    Message: string;
	    Position: number;
	
	    static createFrom(source: any = {}) {
	        return new TrafficQueryError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Message = source["Message"];
	        this.Position = source["Position"];
	    }
	}
	export class LaunchpadSearchResult {
	    EntriesByLaunchpad: Record<string, number[][]>;
	    QueryError?: TrafficQueryError;
	
	    static createFrom(source: any = {}) {
	        return new LaunchpadSearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EntriesByLaunchpad = source["EntriesByLaunchpad"];
	        this.QueryError = this.convertValues(source["QueryError"], TrafficQueryError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SitemapChildrenRequest {
	    Node: string;
	    Cursor: string;
	    Limit: number;
	    Query: string;
	    AsOf: string;
	    Matching: boolean;
	    Exclusion: string[];
	
	    static createFrom(source: any = {}) {
	        return new SitemapChildrenRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Node = source["Node"];
	        this.Cursor = source["Cursor"];
	        this.Limit = source["Limit"];
	        this.Query = source["Query"];
	        this.AsOf = source["AsOf"];
	        this.Matching = source["Matching"];
	        this.Exclusion = source["Exclusion"];
	    }
	}
	export class SitemapNodeCount {
	    Name: string;
	    Segment: string;
	    Pairs: number;
	    Errors: number;
	    HasChildren: boolean;
	    Matching?: number;
	
	    static createFrom(source: any = {}) {
	        return new SitemapNodeCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Segment = source["Segment"];
	        this.Pairs = source["Pairs"];
	        this.Errors = source["Errors"];
	        this.HasChildren = source["HasChildren"];
	        this.Matching = source["Matching"];
	    }
	}
	export class SitemapChildrenResult {
	    Children: SitemapNodeCount[];
	    NextCursor?: string;
	    Complete: boolean;
	    Missing: boolean;
	    QueryError?: TrafficQueryError;
	
	    static createFrom(source: any = {}) {
	        return new SitemapChildrenResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Children = this.convertValues(source["Children"], SitemapNodeCount);
	        this.NextCursor = source["NextCursor"];
	        this.Complete = source["Complete"];
	        this.Missing = source["Missing"];
	        this.QueryError = this.convertValues(source["QueryError"], TrafficQueryError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class TrafficCountOptions {
	    AsOf: string;
	    IgnoreExclusion: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TrafficCountOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.AsOf = source["AsOf"];
	        this.IgnoreExclusion = source["IgnoreExclusion"];
	    }
	}
	export class TrafficCountResult {
	    Count: number;
	    Capped: boolean;
	    IndexComplete: boolean;
	    QueryError?: TrafficQueryError;
	
	    static createFrom(source: any = {}) {
	        return new TrafficCountResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Count = source["Count"];
	        this.Capped = source["Capped"];
	        this.IndexComplete = source["IndexComplete"];
	        this.QueryError = this.convertValues(source["QueryError"], TrafficQueryError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TrafficLinkTarget {
	    Kind: string;
	    ID: string;
	
	    static createFrom(source: any = {}) {
	        return new TrafficLinkTarget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Kind = source["Kind"];
	        this.ID = source["ID"];
	    }
	}
	export class TrafficPageRequest {
	    Query: string;
	    OrderBy: string;
	    Cursor: string;
	    Direction: string;
	    AsOf: string;
	    Limit: number;
	    IgnoreExclusion: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TrafficPageRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Query = source["Query"];
	        this.OrderBy = source["OrderBy"];
	        this.Cursor = source["Cursor"];
	        this.Direction = source["Direction"];
	        this.AsOf = source["AsOf"];
	        this.Limit = source["Limit"];
	        this.IgnoreExclusion = source["IgnoreExclusion"];
	    }
	}
	
	export class TrafficQueryResult {
	    Items: domain.RequestResponseSummary[];
	    NextCursor?: string;
	    PrevCursor?: string;
	    AsOf: string;
	    IndexComplete: boolean;
	    QueryError?: TrafficQueryError;
	
	    static createFrom(source: any = {}) {
	        return new TrafficQueryResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Items = this.convertValues(source["Items"], domain.RequestResponseSummary);
	        this.NextCursor = source["NextCursor"];
	        this.PrevCursor = source["PrevCursor"];
	        this.AsOf = source["AsOf"];
	        this.IndexComplete = source["IndexComplete"];
	        this.QueryError = this.convertValues(source["QueryError"], TrafficQueryError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace struct { ProjectName string; Date string } {
	
	export class  {
	    ProjectName: string;
	    Date: string;
	
	    static createFrom(source: any = {}) {
	        return new (source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ProjectName = source["ProjectName"];
	        this.Date = source["Date"];
	    }
	}

}

export namespace wordlist {
	
	export class Info {
	    Name: string;
	    Size: number;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Size = source["Size"];
	    }
	}

}

