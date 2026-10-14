//! adwaita-shell's services, one process: each module serves one socket
//! (`audio.sock`, `network.sock`, ...) with the topics and methods the
//! shell's `src/data` uses. Started by `tessela run` (see `tessela.toml`).

mod agenda;
mod ai;
mod audio;
mod brightness;
mod media;
mod network;
mod notifications;
mod power;
mod util;
mod weather;

use std::future::Future;
use std::pin::Pin;

use tessela_service::{Host, Service, spawn};

type Start = Pin<Box<dyn Future<Output = ()>>>;

fn main() {
    let modules: Vec<(Service, Start)> = vec![
        agenda::service(),
        ai::service(),
        audio::service(),
        brightness::service(),
        media::service(),
        network::service(),
        notifications::service(),
        power::service(),
        weather::service(),
    ];
    let mut host = Host::new();
    let mut starts = Vec::new();
    for (svc, start) in modules {
        host = host.add(svc);
        starts.push(start);
    }
    let result = host.run(async move {
        for s in starts {
            spawn(s).detach();
        }
    });
    if let Err(e) = result {
        eprintln!("adwaita-services: {e}");
        std::process::exit(1);
    }
}
