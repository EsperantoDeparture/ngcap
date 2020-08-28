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
    // flag with a value (-n, --name=VALUE)
    name: flags.string({ char: "n", description: "name to print" }),
    // flag with no value (-f, --force)
    force: flags.boolean({ char: "f" }),
  };
  launch: Subject<void> = new Subject();
  static args = [{ name: "path" }];
  children: { [childName: string]: ExecaChildProcess } = {};
  launchSubscription: Subscription | null = null;
  async run() {
    const { args } = this.parse(Ngcap);
    if (!args.path) {
      this.error("The path argument is required");
    }
    process.on("exit", () => this.onExit());
    process.on("SIGINT", () => this.onExit());
    process.on("SIGTERM", () => this.onExit());

    this.log(hex("#9983f6").bold("***[BUILD ANGULAR]***"));
    this.children.buildAngular = execa.command("ng build --watch", {
      cwd: args.path,
    });
    this.children.buildAngular.stdout?.on("data", (data) => {
      this.log("\n\n");
      this.log(hex("#9983f6").bold("***[BUILD ANGULAR]***"));
      this.log(data.toString());
      this.log(hex("#9983f6").bold("*".repeat(20)));
      this.log("\n\n");
      this.launch.next();
    });
    this.launchSubscription = this.launch.pipe(debounceTime(500)).subscribe({
      next: () => {
        this.log(hex("#3dc2ff").bold("***[CAPACITOR SYNC]***"));
        execa.commandSync("npx cap sync", {
          cwd: args.path,
          stdio: "inherit",
        });
        this.log(hex("#3dc2ff").bold("*".repeat(20)));
        this.log("\n\n");
        this.log(hex("#5260ff").bold("***[CAPACITOR COPY]***"));
        execa.commandSync("npx cap copy", {
          cwd: args.path,
          stdio: "inherit",
        });
        this.log(hex("#5260ff").bold("*".repeat(20)));
        this.log("\n\n");
        if (this.children.capOpenElectron) {
          kill(this.children.capOpenElectron.pid, "SIGTERM");
        }
        this.children.capOpenElectron = execa.command("npx cap open electron", {
          cwd: args.path,
        });
        this.children.capOpenElectron.stdout?.on("data", (d) =>{
          this.log(hex("#2dd36f").bold("***[CAPACITOR OPEN]***"));
          this.log(d.toString());
          this.log(hex("#2dd36f").bold("*".repeat(20)));
        });
        this.log("\n\n");

        process.stdin.resume();
      },
    });
  }

  onExit() {
    this.log(hex("#ffffff").bold("***[CLEANUP]***"));
    for (const child of Object.values(this.children)) {
      if (!child || !child.pid) {
        continue;
      }
      this.log(hex("#ffffff").bold(`Killing ${child.pid}`));
      kill(child.pid, "SIGTERM");
    }
    this.log(hex("#ffffff").bold("*".repeat(20)));
    this.launchSubscription?.unsubscribe();
    exit(0);
  }
}

export = Ngcap;
