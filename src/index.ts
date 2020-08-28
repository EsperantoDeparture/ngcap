import { Command, flags } from "@oclif/command";
import { hex } from "chalk";
import { Subject, Subscription } from "rxjs";
import { debounceTime } from "rxjs/operators";
import execa, { ExecaChildProcess } from "execa";
import kill from "tree-kill";
import { exit } from 'process';

class Ngcap extends Command {
  static description = "Run an angular capacitor app with livereload";
  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: "v" }),
    help: flags.help({ char: "h" }),
    dir: flags.string({ char: "d", description: "Directory of the angular capacitor project" }),
  };
  launch: Subject<void> = new Subject();
  static args = [{ name: "path" }];
  children: { [childName: string]: ExecaChildProcess } = {};
  launchSubscription: Subscription | null = null;
  async run() {
    const { args, flags } = this.parse(Ngcap);
    args.path = flags.dir || process.cwd();
    process.on("exit", () => this.onExit());
    process.on("SIGINT", () => this.onExit());
    process.on("SIGTERM", () => this.onExit());

    this.log(hex("#ffffff").bold("Starting angular compilation..."));
    this.children.buildAngular = execa.command("ng build --watch", {
      cwd: args.path,
    });
    this.children.buildAngular.stdout?.on("data", (data) => {
      this.log(hex("#9983f6").bold("***[BUILD ANGULAR]***"));
      this.log(data.toString());
      this.launch.next();
    });
    this.children.buildAngular.stderr?.on("data", (data) => {
      this.log(hex("#9983f6").bold("***[(ERROR) BUILD ANGULAR]***"));
      this.log(data.toString());
    });
    this.launchSubscription = this.launch.pipe(debounceTime(500)).subscribe({
      next: () => {
        this.capSync(args.path);
        this.capOpen(args.path);
      },
    });
    process.stdin.resume();
  }

  capSync(path: string) {
    this.log(hex("#3dc2ff").bold("***[CAPACITOR SYNC]***"));
    execa.commandSync("npx cap sync", {
      cwd: path,
      stdio: "inherit",
    });
  }

  capOpen(path: string) {
    if (this.children.capOpenElectron) {
      kill(this.children.capOpenElectron.pid, "SIGTERM");
    }
    this.children.capOpenElectron = execa.command("npx cap open electron", {
      cwd: path,
    });
    this.children.capOpenElectron.stdout?.on("data", (d) =>{
      this.log(hex("#2dd36f").bold("***[CAPACITOR OPEN]***"));
      this.log(d.toString());
    });
    this.children.capOpenElectron.stderr?.on("data", (d) =>{
      this.log(hex("#2dd36f").bold("***[(ERROR) CAPACITOR OPEN]***"));
      this.log(d.toString());
    });
  }

  onExit() {
    for (const child of Object.values(this.children)) {
      if (!child || !child.pid) {
        continue;
      }
      kill(child.pid, "SIGTERM");
    }
    this.launchSubscription?.unsubscribe();
    exit(0);
  }
}

export = Ngcap;
